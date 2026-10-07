# VerifyWise + MLflow Integration User Guide

## Introduction
The MLflow extension pulls the models and runs that data science teams register in MLflow into VerifyWise, so governance and compliance teams can review model metadata, lifecycle stages, run metrics and experiment context without leaving the Model Inventory. This guide explains how to set up the extension and how to work with the synced data in **Model Inventory → MLFlow**.

## Prerequisites
Before configuring the integration you need:

- **VerifyWise admin access.** An Admin enables and configures extensions for the organization.
- **MLflow tracking server details.** Collect the base URL (e.g., `https://mlflow.company.com:5000`), authentication method, and any credentials. The integration is read-only, but the MLflow account must be able to list and describe experiments and runs.

VerifyWise supports one MLflow configuration per organization. Each organization stores its own credentials and synced records, so multi-tenant deployments stay isolated.

## Setting up the MLflow extension
1. Go to **Extensions** and click **Configure to enable** on the MLflow card.
2. Fill in the **Tracking server URL** and **Request timeout (seconds)** (1–600, default 30). The timeout applies to each request VerifyWise makes to MLflow; increase it for slow on-prem servers. A whole sync or connection test stops after 110 seconds regardless.
3. Choose an **Authentication method**:
   - `None` – use when the server allows anonymous read access.
   - `Basic (username / password)` – enter a username and password.
   - `Token` – enter a personal access token or service token.
4. Password and token fields are stored encrypted; leave a secret field blank later to keep the existing value. VerifyWise always verifies the server's TLS certificate, so a self-signed MLflow server needs a certificate the VerifyWise server trusts (for example via `NODE_EXTRA_CA_CERTS`).
5. Click **Enable**, then **Test connection** to check that VerifyWise can reach the server with the saved settings.

## Syncing models
Sync is manual. VerifyWise does not run a scheduled MLflow sync.

- Open **Model Inventory → MLFlow** and click **Sync**. VerifyWise fetches experiments and runs from the MLflow REST API and upserts them into the `mlflow_model_records` table, keyed by organization, model name and version, so re-syncing updates existing records instead of creating duplicates.
- If the sync fails, the tab shows "Sync failed:" followed by the reason (for example `Failed to fetch runs: HTTP 403`, a timeout, or a connection error such as `ECONNREFUSED` or `SELF_SIGNED_CERT_IN_CHAIN`) and keeps displaying the records from the last successful sync. A server with no runs yet syncs successfully with zero models.
- Sync again whenever you need fresh data, for example before a model review.

## Working with Model Inventory → MLFlow data

### Summary cards
Four cards at the top of the tab ("Models", "Active", "Staging", "Experiments") summarize what is currently stored for your organization.

### Data table
The table lists each synced model version with columns for Model Name, Version, Status, Created date, Last Updated date, Description, and Actions. You can group rows by lifecycle stage, experiment or model name. Click a row, or **View details** in the Actions column, to open the detail view, which includes:

- High-level metadata (version, lifecycle stage, run ID, creation time).
- Description text, tags, metrics, and parameters pulled from the MLflow run.
- Experiment information (ID, name, artifact location) so you can trace lineage.

## Troubleshooting
- **Connection test fails?** Check the tracking server URL, the authentication method and credentials, network access between VerifyWise and MLflow, and that the server's TLS certificate is trusted by the VerifyWise server. Increase the request timeout for slow servers.
- **Sync succeeds but no data appears?** Confirm the MLflow account has permission to list experiments and runs, and that the server actually has runs recorded.
- **Data looks out of date?** Click **Sync** on the MLFlow tab. Nothing pulls from MLflow in the background.
- **Multi-tenant deployments:** Each organization repeats the setup steps above. Its configuration and model data stay isolated because VerifyWise scopes records by `organization_id`.
