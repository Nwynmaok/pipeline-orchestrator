module.exports = {
  apps: [{
    name: 'pipeline-orchestrator',
    script: './dist/index.js',
    cwd: '/Users/wynclaw/projects/pipeline-orchestrator',
    env: {
      NODE_ENV: 'production',
    },
    max_memory_restart: '512M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true,
  }]
};
