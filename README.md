# Automazione del deploy su OpenShift

Questo documento spiega come il repository viene portato in automatico sul cluster OpenShift: come Jenkins si collega al cluster, quando parte la pipeline, come vengono applicati i manifest con Kustomize e come Reloader riavvia i pod quando cambia la configurazione.

Per l'architettura più dettagliata del progetto andare su: https://github.com/mariusdumitru5/snake-web

## Flusso in breve

```
git push su main
      │
      ▼
Jenkins (pollSCM, ogni ora) ── rileva il commit nuovo
      │
      ▼
oc login con il token del service account jenkins-automation
      │
      ▼
oc kustomize openshift/ | oc apply -f -   ── aggiorna ConfigMap, Deployment, BuildConfig…
      │
      ▼
Reloader vede ConfigMap/Secret cambiati ── rollout dei Deployment interessati
```

## Collegamento tra Jenkins e OpenShift

Jenkins non usa un utente personale: si autentica sul cluster con il service account **`jenkins-automation`** del progetto **`dev-automation`**.

Il token del service account è salvato in Jenkins come credenziale di tipo *Secret text* con ID **`openshift-sa-token`**. La pipeline lo legge con `withCredentials` e fa il login:

```groovy
withCredentials([
    string(credentialsId: 'openshift-sa-token', variable: 'OC_TOKEN'),
    file(credentialsId: 'redis-password', variable: 'REDIS_PASSWORD')
]) {
    sh '''
    oc login ${CLUSTER_URL} --token=${OC_TOKEN} --insecure-skip-tls-verify=true
    oc project ${PROJECT_NAME}
    '''
}
```

Nella stessa chiamata viene letta anche la credenziale **`redis-password`**, di tipo *Secret file*: contiene il manifest del Secret di Redis, che così non compare mai nel repository.

Per ricreare il service account su un altro cluster o progetto:

```bash
oc create serviceaccount jenkins-automation -n dev-automation
oc adm policy add-role-to-user edit -z jenkins-automation -n dev-automation
oc create token jenkins-automation -n dev-automation --duration=8760h
```

Il token generato dall'ultimo comando va inserito in Jenkins come credenziale `openshift-sa-token`. Con il ruolo `edit` il service account può gestire Deployment, Service, ConfigMap e build, ma **non** può creare Role e RoleBinding: per questo Reloader viene installato a parte (vedi sotto).

## La pipeline (`Jenkinsfile`)

La pipeline gira sull'agent con label `mac-worker` e ha un solo stage, che esegue nell'ordine:

1. login al cluster e selezione del progetto `dev-automation`;
2. `oc apply` del Secret di Redis dalla credenziale `redis-password`;
3. applicazione di tutti i manifest della cartella `openshift/` tramite Kustomize;
4. eliminazione dei pod di build già completati;
5. stampa dei pod attivi, come verifica finale nei log del job.

Per l'eliminazione dei pod di build viene usato:

```bash
oc delete pod -l openshift.io/build.name --field-selector=status.phase==Succeeded
```

L'etichetta `openshift.io/build.name` è presente solo sui pod creati dalle BuildConfig, quindi i pod delle applicazioni non vengono toccati. I pod di build falliti restano, per poterne leggere i log. Le build e le immagini prodotte (`backend-auth:latest`, `backend-snake:latest`) non vengono eliminate.

## Polling SCM

Jenkins non riceve webhook da GitHub, perché il server Jenkins non è raggiungibile da internet. È Jenkins a controllare il repository:

```groovy
triggers {
    pollSCM('H * * * *')
}
```

Una volta all'ora Jenkins confronta l'ultimo commit di `main` con quello dell'esecuzione precedente e lancia la pipeline **solo se ci sono commit nuovi**. La `H` fa scegliere a Jenkins un minuto fisso dell'ora, così i job non partono tutti insieme. Il trigger viene registrato dopo la prima esecuzione manuale della pipeline.

## Kustomize (`openshift/kustomization.yaml`)

Kustomize riunisce in un'unica applicazione tutti i manifest della cartella `openshift/` (elencati in `resources`, numerati per indicare l'ordine logico) e genera le ConfigMap a partire dal repository:

| ConfigMap | Contenuto | Usata da |
|---|---|---|
| `frontend-assets` | `index.html`, `index.js`, `style.css`, `default.conf` presi da `../frontend/` | `frontend` (montati come file in nginx) |
| `backend-conf` | `REDIS_HOST`, `REDIS_PORT`, `TOKEN_TTL` | `backend-auth`, `backend-snake` |
| `backend-snake` | `AUTH_URL` | `backend-snake` |

Due scelte sono importanti per il funzionamento dell'automazione:

- **`disableNameSuffixHash: true`**: le ConfigMap mantengono sempre lo stesso nome, senza hash. Quando cambia un valore, la ConfigMap esistente viene **aggiornata** invece di esserne creata una nuova, ed è proprio l'aggiornamento che Reloader intercetta.
- **`--load-restrictor LoadRestrictionsNone`**: per impostazione predefinita Kustomize non legge file fuori dalla sua cartella. L'opzione serve perché i file del frontend stanno in `../frontend/`.

Per vedere cosa verrebbe applicato, senza toccare il cluster:

```bash
oc kustomize openshift/ --load-restrictor LoadRestrictionsNone
```

Il frontend quindi non ha una build: la pagina viene servita da un'immagine nginx standard, e i file del sito arrivano dalla ConfigMap `frontend-assets`. Modificare `index.js` e fare push basta ad aggiornare il sito.

## Reloader

Kubernetes non riavvia i pod quando cambia una ConfigMap o un Secret: le variabili d'ambiente vengono lette solo all'avvio del container. Questo compito lo svolge [Reloader](https://github.com/stakater/Reloader) di Stakater, un controller che sorveglia ConfigMap e Secret e fa ripartire i Deployment che li usano.

Reloader è installato **una sola volta**, tramite Helm, nel progetto `dev-automation`. Non fa parte della pipeline, perché il service account di Jenkins non ha i permessi per creare Role:

```bash
helm repo add stakater https://stakater.github.io/stakater-charts
helm repo update
helm upgrade --install reloader stakater/reloader \
  --namespace dev-automation \
  --set reloader.watchGlobally=false \
  --set reloader.deployment.securityContext.runAsUser=null
```

- `watchGlobally=false` limita Reloader al solo namespace `dev-automation`, quindi bastano i permessi di amministratore del progetto.
- `runAsUser=null` lascia che sia OpenShift ad assegnare l'UID del container, come richiesto dalle SCC.

Ogni Deployment che deve riavviarsi ha questa annotazione nei suoi `metadata`:

```yaml
metadata:
  annotations:
    reloader.stakater.com/auto: "true"
```

Con `auto` Reloader osserva tutte le ConfigMap e i Secret che il Deployment usa:

| Deployment | Si riavvia quando cambia |
|---|---|
| `frontend` | `frontend-assets` |
| `backend-auth` | `backend-conf`, `redis-password` |
| `backend-snake` | `backend-conf`, `backend-snake`, `redis-password` |

I Deployment dei backend hanno anche un secondo trigger, `image.openshift.io/triggers`, che è indipendente da Reloader: aggiorna i pod quando la BuildConfig produce una nuova immagine nell'ImageStream.

Per verificare che Reloader funzioni:

```bash
oc patch configmap backend-conf -p '{"data":{"TOKEN_TTL":"7200"}}'
oc get pods -l app=backend-auth -w
```

Entro pochi secondi deve comparire un pod nuovo, e il nuovo valore si vede con `oc rsh deployment/backend-auth env | grep TOKEN_TTL`. Ricordatevi di rimettere il valore originale.
