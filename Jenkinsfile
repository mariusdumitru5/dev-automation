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
                withCredentials([string(credentialsId: 'openshift-sa-token', variable: 'OC_TOKEN')]) {
                    sh '''
                    # Login al cluster
                    oc login ${CLUSTER_URL} --token=${OC_TOKEN} --insecure-skip-tls-verify=true
                    
                    # Selezione del namespace
                    oc project ${PROJECT_NAME}

                    # Verifica dei Pods attualmente attivi nel namespace
                    echo "--- Lista Pods attivi ---"
                    oc get pods
                    '''
                }
            }
        }
    }
}