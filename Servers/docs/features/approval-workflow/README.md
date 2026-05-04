# Approval Workflow & Real-time Notification System

## Overview

This feature implements a complete approval workflow system with real-time notifications for use-case approvals. When a use-case is created with an assigned approval workflow, it goes through multiple approval steps before frameworks are created.

## Key Features

- **Multi-step approval workflows**: Configure workflows with multiple sequential approval steps
- **Flexible approver requirements**: Steps can require all approvers or just one approver to proceed
- **Real-time notifications**: Approvers are notified instantly via Server-Sent Events (SSE)
- **Deferred framework creation**: Frameworks are only created after full approval
- **Multi-tenant safe**: Complete isolation between organizations
- **Transaction-safe notifications**: Notifications sent only after database commits
- **Multi-server support**: Redis Pub/Sub ensures notifications work across multiple server instances

## Quick Reference

### Main Components

| Component                | Location                                     | Purpose                      |
| ------------------------ | -------------------------------------------- | ---------------------------- |
| Approval Workflow Routes | `routes/approvalWorkflow.route.ts`           | Workflow CRUD endpoints      |
| Approval Request Routes  | `routes/approvalRequest.route.ts`            | Request processing endpoints |
| Notification Routes      | `routes/notification.route.ts`               | SSE streaming endpoint       |
| Workflow Utils           | `utils/approvalWorkflow.utils.ts`            | Workflow business logic      |
| Request Utils            | `utils/approvalRequest.utils.ts`             | Request processing logic     |
| Notification Service     | `services/notification.service.ts`           | Notification publishing      |
| Notification Subscriber  | `services/notificationSubscriber.service.ts` | Redis subscriber             |
| Notification Controller  | `controllers/notification.ctrl.ts`           | SSE connection management    |

### Database Tables

- `approval_workflows` - Workflow templates
- `approval_workflow_steps` - Step definitions
- `approval_step_approvers` - Step approvers
- `approval_requests` - Active approval requests
- `approval_request_steps` - Request step instances
- `approval_request_step_approvals` - Individual approver responses

## Documentation Index

1. [Architecture](./architecture.md) - System design and architecture decisions
2. [Database Schema](./database-schema.md) - Complete database structure
3. [Notification System](./notification-system.md) - How real-time notifications work
4. [API Endpoints](./api-endpoints.md) - Complete API documentation
5. [Code Flow](./code-flow.md) - Step-by-step execution flows
6. [Security](./security.md) - Security considerations and multi-tenancy
7. [Troubleshooting](./troubleshooting.md) - Common issues and solutions

## Quick Start Example

### Create a Workflow

```bash
POST /api/approval-workflows
{
  "workflow_title": "Use Case Approval",
  "entity": 1,
  "steps": [
    {
      "step_number": 1,
      "step_name": "Marketing Review",
      "requires_all_approvers": false,
      "approvers": [2, 3]
    },
    {
      "step_number": 2,
      "step_name": "Finance Approval",
      "requires_all_approvers": true,
      "approvers": [4]
    }
  ]
}
```

### Create Use-Case with Workflow

```bash
POST /api/projects
{
  "project_title": "Q1 Campaign",
  "approval_workflow_id": 5,
  "framework": [1, 2],
  ...
}
```

### Approve a Request

```bash
POST /api/approval-requests/14/approve
{
  "comments": "Approved!"
}
```

## Recent Changes

### 2026-01-09

- **Fixed notification timing bug**: Moved notification calls to after transaction commits
- **Fixed project visibility**: Editors and Auditors can now view all projects
- **Added real-time count updates**: Approval request count auto-refreshes on notifications
- **Improved alert consistency**: Notifications now use standard alert styling
- **Improved transaction handling**: Updated all READ queries to use proper optional transaction pattern (`transaction: Transaction | null = null` with conditional spread)
- **Removed debug logging**: Cleaned up all console.log statements from frontend and backend for production-ready code
- **Fixed final approval notification**: Parse SQL COUNT results as integers to ensure proper type comparison when determining if all steps are completed
- **Fixed CodeQL security alert**: Removed console.log statements with user-controlled format strings (externally-controlled format string vulnerability)

## Related Features

- **Use-Case Management**: Integration point for approval workflow assignment
- **Framework Management**: Deferred creation after approval
- **User Management**: Approver selection and permissions

## Support

For questions or issues, refer to:

- [Troubleshooting Guide](./troubleshooting.md)
- [Code Flow Documentation](./code-flow.md)
- Check server logs for detailed error messages
