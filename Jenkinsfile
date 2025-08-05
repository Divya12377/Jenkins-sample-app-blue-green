pipeline {
    agent {
        kubernetes {
            yaml '''
apiVersion: v1
kind: Pod
metadata:
  labels:
    app: jenkins-agent
spec:
  containers:
  - name: jnlp
    image: jenkins/inbound-agent:latest
    args: ['\$(JENKINS_SECRET)', '\$(JENKINS_NAME)']
  - name: docker
    image: docker:latest
    command: ['cat']
    tty: true
    volumeMounts:
    - name: docker-sock
      mountPath: /var/run/docker.sock
  volumes:
  - name: docker-sock
    hostPath:
      path: /var/run/docker.sock
'''
        }
    }

    environment {
        DOCKER_HUB_REPO = 'raheman456/sample-node-app'
        KUBE_NAMESPACE = 'jenkins'
        PATH = "$PATH:/usr/local/bin"
    }

    stages {
        stage('Prepare Environment') {
            steps {
                container('docker') {
                    script {
                        sh '''
                            echo "Setting up tools..."
                            apk add --no-cache curl
                            curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
                            chmod +x kubectl
                            mv kubectl /usr/local/bin/
                        '''
                    }
                }
            }
        }

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Determine Deployment Color') {
            steps {
                container('docker') {
                    script {
                        def currentVersion = sh(
                            script: "kubectl get service sample-app-service -n $KUBE_NAMESPACE -o jsonpath='{.spec.selector.version}' 2>/dev/null || echo 'none'",
                            returnStdout: true
                        ).trim()

                        if (currentVersion == 'blue') {
                            env.DEPLOY_VERSION = 'green'
                            env.DEPLOY_FILE = 'app-green.yaml'
                            env.CURRENT_VERSION = 'blue'
                        } else {
                            env.DEPLOY_VERSION = 'blue'
                            env.DEPLOY_FILE = 'app-blue.yaml'
                            env.CURRENT_VERSION = currentVersion == 'green' ? 'green' : 'none'
                        }

                        echo "Current version: ${env.CURRENT_VERSION}"
                        echo "Deploying version: ${env.DEPLOY_VERSION}"
                    }
                }
            }
        }

        stage('Build and Push Image') {
            steps {
                container('docker') {
                    withCredentials([usernamePassword(
                        credentialsId: 'docker-hub-credentials',
                        usernameVariable: 'DOCKER_USER',
                        passwordVariable: 'DOCKER_PASS'
                    )]) {
                        sh """
                            echo "Logging in to Docker Hub..."
                            echo \$DOCKER_PASS | docker login -u \$DOCKER_USER --password-stdin
                            
                            echo "Building Docker image..."
                            docker build -t $DOCKER_HUB_REPO:$DEPLOY_VERSION ./app
                            
                            echo "Pushing image to registry..."
                            docker push $DOCKER_HUB_REPO:$DEPLOY_VERSION
                            
                            docker logout
                        """
                    }
                }
            }
        }

        stage('Deploy New Version') {
            steps {
                container('docker') {
                    script {
                        sh """
                            echo "Deploying $DEPLOY_VERSION version..."
                            sed "s|{{IMAGE}}|$DOCKER_HUB_REPO:$DEPLOY_VERSION|g" ./app/$DEPLOY_FILE > temp-deploy.yaml
                            kubectl apply -f temp-deploy.yaml -n $KUBE_NAMESPACE
                            kubectl apply -f ./app/app-service.yaml -n $KUBE_NAMESPACE
                            rm temp-deploy.yaml
                            
                            echo "Waiting for deployment to be ready..."
                            kubectl rollout status deployment/sample-app-$DEPLOY_VERSION -n $KUBE_NAMESPACE --timeout=300s
                        """
                    }
                }
            }
        }

        stage('Verify Deployment') {
            steps {
                container('docker') {
                    script {
                        sh """
                            echo "Verifying deployment..."
                            kubectl wait --for=condition=available --timeout=300s deployment/sample-app-$DEPLOY_VERSION -n $KUBE_NAMESPACE
                            echo "Verifying service endpoints..."
                            kubectl get endpoints sample-app-service -n $KUBE_NAMESPACE
                        """
                    }
                }
            }
        }
    }

    post {
        always {
            container('docker') {
                sh '''
                    echo "Cleaning up..."
                    docker logout || true
                '''
            }
        }
        failure {
            container('docker') {
                script {
                    echo "❌ Deployment failed! Attempting rollback..."
                    if (env.CURRENT_VERSION && env.CURRENT_VERSION != 'none') {
                        sh """
                            kubectl patch service sample-app-service -n $KUBE_NAMESPACE -p '{"spec":{"selector":{"version":"$CURRENT_VERSION"}}}'
                            echo "Rolled back to $CURRENT_VERSION"
                        """
                    }
                }
            }
        }
    }
}
