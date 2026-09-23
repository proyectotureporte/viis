module.exports = {
  apps: [
    {
      name: 'viis-copia',
      cwd: '/var/www/viis-copia',
      script: 'pnpm',
      args: 'start',
      env: { NODE_ENV: 'production', PORT: '4012' },
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '768M',
    },
    {
      name: 'viis-copia-worker',
      cwd: '/var/www/viis-copia',
      script: 'pnpm',
      args: 'worker',
      env: { NODE_ENV: 'production' },
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: '384M',
      kill_timeout: 5000,
    },
  ],
};
