import type { ArticleContent } from '../../contentTypes';

export const installingContent: ArticleContent = {
  blocks: [
    {
      type: 'time-estimate',
      text: '**Setup time:** 20-30 minutes',
    },
    {
      type: 'heading',
      id: 'before-you-begin',
      level: 2,
      text: 'Prerequisites',
    },
    {
      type: 'paragraph',
      text: "VerifyWise runs on your infrastructure. Before you start, make sure you have these in place:",
    },
    {
      type: 'requirements',
      items: [
        {
          icon: 'Server',
          title: 'Server',
          items: [
            'Linux server (Ubuntu 20.04+ recommended)',
            '2 GB RAM minimum, 2 CPU cores',
            '20 GB free disk space',
          ],
        },
        {
          icon: 'Terminal',
          title: 'Software',
          items: [
            'Docker and Docker Compose (production)',
            'Node.js 22 and npm (development only)',
            'Git',
          ],
        },
        {
          icon: 'Database',
          title: 'Networking',
          items: [
            'Port 3000 (backend API)',
            'Port 8080 (frontend, production) or 5173 (frontend, development)',
            'Port 5432 for PostgreSQL and 6379 for Redis (can be internal-only)',
          ],
        },
      ],
    },
    {
      type: 'heading',
      id: 'deployment-method',
      level: 2,
      text: 'Pick a deployment method',
    },
    {
      type: 'grid-cards',
      columns: 2,
      items: [
        {
          title: 'Production (Docker Compose)',
          description: 'One install script, everything containerized. Use this unless you plan to modify the source code.',
        },
        {
          title: 'Development (npm)',
          description: 'Frontend and backend run separately with hot reload. Use this if you want to contribute or customize.',
        },
      ],
    },
    {
      type: 'heading',
      id: 'production-setup',
      level: 2,
      text: 'Production setup',
    },
    {
      type: 'heading',
      id: 'production-step-1',
      level: 3,
      text: '1. Download the install files',
    },
    {
      type: 'code',
      code: `mkdir verifywise && cd verifywise
curl -O https://raw.githubusercontent.com/bluewave-labs/verifywise/develop/install.sh
curl -O https://raw.githubusercontent.com/bluewave-labs/verifywise/develop/.env.prod`,
    },
    {
      type: 'heading',
      id: 'production-step-2',
      level: 3,
      text: '2. Edit environment variables',
    },
    {
      type: 'paragraph',
      text: "Open `.env.prod` and change the values below. Everything else has sensible defaults.",
    },
    {
      type: 'code',
      code: `# Your server's IP or domain (replace localhost)
BACKEND_URL=http://your-server-ip:3000
FRONTEND_URL=http://your-server-ip:8080

# Generate a JWT secret: openssl rand -base64 32
JWT_SECRET=your-generated-secret-here

# Pick a strong database password
POSTGRES_PASSWORD=your-secure-password`,
    },
    {
      type: 'heading',
      id: 'production-step-3',
      level: 3,
      text: '3. Run the installer',
    },
    {
      type: 'code',
      code: `chmod +x ./install.sh
./install.sh`,
    },
    {
      type: 'paragraph',
      text: "The script pulls Docker images, creates the database and starts all services. When it finishes, open your `FRONTEND_URL` in a browser.",
    },
    {
      type: 'heading',
      id: 'development-setup',
      level: 2,
      text: 'Development setup',
    },
    {
      type: 'paragraph',
      text: "This runs frontend and backend separately with hot reload. You'll need 2 terminal windows (3 if you want the BullMQ worker for background jobs).",
    },
    {
      type: 'heading',
      id: 'dev-step-1',
      level: 3,
      text: '1. Clone and install',
    },
    {
      type: 'code',
      code: `git clone https://github.com/bluewave-labs/verifywise.git
cd verifywise

cd Clients && npm install
cd ../Servers && npm install`,
    },
    {
      type: 'heading',
      id: 'dev-step-2',
      level: 3,
      text: '2. Start PostgreSQL and Redis',
    },
    {
      type: 'paragraph',
      text: 'The easiest way is Docker containers:',
    },
    {
      type: 'code',
      code: `docker run -d --name mypostgres -p 5432:5432 \\
  -e POSTGRES_PASSWORD=your_password postgres

docker run -d --name myredis -p 6379:6379 redis

docker exec -it mypostgres psql -U postgres -c "CREATE DATABASE verifywise;"`,
    },
    {
      type: 'heading',
      id: 'dev-step-3',
      level: 3,
      text: '3. Configure and start',
    },
    {
      type: 'code',
      code: `# Copy the dev environment file
cp .env.dev Servers/.env

# Terminal 1: backend with auto-restart
cd Servers && npm run watch

# Terminal 2: frontend with hot reload
cd Clients && npm run dev`,
    },
    {
      type: 'paragraph',
      text: 'Frontend: `http://localhost:5173`. Backend API: `http://localhost:3000`.',
    },
    {
      type: 'heading',
      id: 'environment-config',
      level: 2,
      text: 'Environment variables reference',
    },
    {
      type: 'table',
      columns: [
        { key: 'variable', label: 'Variable', width: '200px' },
        { key: 'description', label: 'Description' },
      ],
      rows: [
        { variable: 'BACKEND_URL', description: 'URL where the API is reachable (default: http://localhost:3000)' },
        { variable: 'FRONTEND_URL', description: 'URL where the web app is served (default: http://localhost:8080 in prod)' },
        { variable: 'JWT_SECRET', description: 'Secret for signing access and refresh tokens' },
        { variable: 'POSTGRES_PASSWORD', description: 'PostgreSQL password' },
        { variable: 'POSTGRES_DB', description: 'Database name (default: verifywise)' },
        { variable: 'REDIS_HOST', description: 'Redis hostname (default: localhost)' },
      ],
    },
    {
      type: 'heading',
      id: 'first-access',
      level: 2,
      text: 'First login',
    },
    {
      type: 'paragraph',
      text: "VerifyWise ships with no default accounts. The first time you open the app, you'll see a registration page where you create the admin account.",
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Open your VerifyWise URL in a browser' },
        { text: 'Fill in the admin registration form' },
        { text: 'Log in with the credentials you just created' },
        { text: "You'll land on the dashboard" },
      ],
    },
    {
      type: 'callout',
      variant: 'warning',
      title: 'Do this immediately',
      text: "The registration page is open to anyone who can reach your URL until the first admin account exists. Don't leave the instance accessible without completing registration.",
    },
    {
      type: 'heading',
      id: 'ssl-security',
      level: 2,
      text: 'SSL setup',
    },
    {
      type: 'paragraph',
      text: "For production, put a reverse proxy (Nginx, Caddy, or your cloud load balancer) in front of VerifyWise and terminate TLS there. Free certificates are available through Let's Encrypt.",
    },
    {
      type: 'ordered-list',
      items: [
        { text: 'Install Nginx (or Caddy) on your server' },
        { text: "Obtain a certificate for your domain (Certbot handles Let's Encrypt automatically)" },
        { text: 'Configure the proxy to forward traffic to ports 3000 (API) and 8080 (frontend)' },
        { text: 'Update `BACKEND_URL` and `FRONTEND_URL` in `.env.prod` to use `https://`' },
        { text: 'Restart the services: `docker compose restart`' },
      ],
    },
    {
      type: 'callout',
      variant: 'tip',
      title: 'Next step',
      text: 'Read the dashboard guide to learn how the interface is organized, then follow the quick start to create your first use case.',
    },
  ],
};
