/**
 * PM2 for low-RAM servers (~384MB limit).
 *   pm2 start ecosystem.config.low-memory.cjs
 */
module.exports = {
  apps: [
    {
      name: "sai-management",
      script: "scripts/start-low-memory.sh",
      interpreter: "bash",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--max-old-space-size=384",
        UV_THREADPOOL_SIZE: "2",
        DB_CONNECTION_LIMIT: "2",
      },
      max_memory_restart: "400M",
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
