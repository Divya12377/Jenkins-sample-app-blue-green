# Blue-Green Deployment on EKS with Jenkins

This project demonstrates a complete blue-green deployment strategy for a Node.js application on Amazon EKS, orchestrated by Jenkins.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [EKS Cluster Setup](#eks-cluster-setup)
3. [Jenkins Installation](#jenkins-installation)
4. [Sample Application](#sample-application)
5. [Blue-Green Deployment](#blue-green-deployment)
6. [Jenkins Pipeline](#jenkins-pipeline)
7. [Accessing the Application](#accessing-the-application)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

- AWS account with appropriate permissions
- AWS CLI configured
- kubectl installed
- Docker installed (for local image building)
- Basic knowledge of Kubernetes and Jenkins

## EKS Cluster Setup

1. **Create EKS Cluster**:
   - Go to EKS Console → Add cluster → Create
   - Cluster configuration:
     - Name: Jenkins-cluster
     - Kubernetes version: 1.29
     - Cluster service role: EKSClusterRole
     - VPC: Default VPC
     - Security groups: Default
     - Endpoint access: Public and private
     - Logging: Enable all logs

2. **Add Node Group**:
   - In your EKS cluster → Compute tab → Add node group
   - Node group configuration:
     - Name: nodes
     - Node IAM role: EKSNodeRole
     - AMI type: Amazon Linux 2
     - Instance type: t3.medium
     - Disk size: 20GB
     - Scaling configuration:
       - Desired size: 2
       - Minimum size: 1
       - Maximum size: 3

3. **Configure kubectl**:
   ```bash
   aws eks --region <your-region> update-kubeconfig --name Jenkins-cluster
Jenkins Installation
Create Kubernetes Resources:

bash
kubectl create namespace jenkins
kubectl apply -f jenkins-rbac.yaml
kubectl apply -f jenkins-pvc.yaml
kubectl apply -f jenkins-deployment.yaml
kubectl apply -f jenkins-service.yaml
Access Jenkins:

Get the LoadBalancer URL:

bash
kubectl get svc jenkins-service -n jenkins
Retrieve initial admin password:

bash
kubectl exec -n jenkins $(kubectl get pods -n jenkins -l app=jenkins -o jsonpath='{.items[0].metadata.name}') -- cat /var/jenkins_home/secrets/initialAdminPassword
Complete setup wizard and install suggested plugins

Sample Application
A simple Node.js application with two versions (blue and green):

File Structure:

text
/app
  ├── Dockerfile
  ├── app-blue.yaml
  ├── app-green.yaml
  ├── app-service.yaml
  ├── package.json
  └── server.js
Build and Push Docker Images:

bash
docker build -t your-dockerhub-username/sample-node-app:blue .
docker build -t your-dockerhub-username/sample-node-app:green .
docker push your-dockerhub-username/sample-node-app:blue
docker push your-dockerhub-username/sample-node-app:green
Blue-Green Deployment
Initial Deployment:

bash
kubectl apply -f app-blue.yaml -n jenkins
kubectl apply -f app-service.yaml -n jenkins
kubectl apply -f app-green.yaml -n jenkins
Verify Deployments:

bash
kubectl get deployments -n jenkins
kubectl get pods -n jenkins
kubectl get svc sample-app-service -n jenkins
Jenkins Pipeline
The Jenkinsfile implements a complete blue-green deployment strategy:

Features:

Automatic detection of current active version

Deployment of new version

Health checks and verification

Automatic rollback on failure

Pipeline Stages:

Install Tools (kubectl)

Checkout code

Determine deployment color

Deploy new version

Verify deployment

Rollback if needed

To set up the pipeline:

Create a new Pipeline job in Jenkins

Point to your Git repository

Specify the Jenkinsfile path

Accessing the Application
Jenkins UI:

text
http://<your-loadbalancer-url>:8080
Sample Application:

text
http://<sample-app-loadbalancer-url>
Troubleshooting
kubectl not found:

Ensure the tool installation stage completes successfully

Check workspace permissions

Docker issues:

Verify Docker is installed on Jenkins agent

Check Docker Hub credentials

Kubernetes RBAC errors:

Verify the Jenkins service account has proper permissions

Check ClusterRoleBinding

Persistent Volume issues:

Ensure EBS volume exists and is properly configured

Check storage class

Application health checks:

Verify the /health endpoint is accessible

Check pod logs for errors

Cleanup
To delete all resources:

bash
kubectl delete -f app-blue.yaml -f app-green.yaml -f app-service.yaml -n jenkins
kubectl delete -f jenkins-deployment.yaml -f jenkins-service.yaml -f jenkins-pvc.yaml -f jenkins-rbac.yaml -n jenkins
eksctl delete cluster --name Jenkins-cluster


This README provides:
1. Complete setup instructions
2. Clear organization with sections
3. Troubleshooting guidance
4. Visual representation of the workflow
5. Cleanup instructions
6. All the steps you've implemented in a structured format

You can customize the Docker Hub username, region specifics, and load balancer URLs as needed for your actual deployment.
