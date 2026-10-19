pipeline {
    agent { label 'mac-worker' }

    environment {
        CLUSTER_URL = 'https://api.openshift-ai-lab01.ocp-ai.corp.sourcesense.com:6443'
        PROJECT_NAME = 'dev-automation'
    }

    stages {
        stage('Login & Test OpenShift') {
            steps {
                // Legge il token salvato nelle credenziali usando l'ID 'openshift-sa-token'
                withCredentials([
                    string(credentialsId: 'openshift-sa-token', variable: 'OC_TOKEN'),
                    file(credentialsId: 'redis-password', variable: 'REDIS_PASSWORD')
                    ]) {
                    sh '''
                    # Login al cluster
                    oc login ${CLUSTER_URL} --token=${OC_TOKEN} --insecure-skip-tls-verify=true
                    
                    # Selezione del namespace
                    oc project ${PROJECT_NAME}

                    # Intall del controller per il rollout automatico dei pod 
                    helm repo add stakater https://stakater.github.io/stakater-charts
                    helm repo update
                    helm upgrade --install reloader stakater/reloader --set reloader.watchGlobally=false --set reloader.deployment.securityContext.runAsUser=null

                    # Applica il secret di redis
                    oc apply -f "$REDIS_PASSWORD"

                    # Applica i manifest della cartella openshift
                    oc kustomize openshift/ --load-restrictor LoadRestrictionsNone | oc apply -f -

                    #  Elimino pod temporanei 
                    oc delete pod -l openshift.io/build.name --field-selector=status.phase==Succeeded

                    # Verifica dei Pods attualmente attivi nel namespace
                    echo "--- Lista Pods attivi ---"
                    oc get pods
                    '''
                }
            }
        }
    }
}