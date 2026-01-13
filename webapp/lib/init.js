let initialized = false;

export async function ensureInitialized() {
  if (initialized) {
    return;
  }

  if (typeof window !== 'undefined') {
    return; // Don't run on client
  }

  try {
    const { spawn } = await import('child_process');
    const { join } = await import('path');
    
    const initScript = join(process.cwd(), 'scripts', 'init-db.js');
    
    await new Promise((resolve, reject) => {
      const child = spawn('node', [initScript], {
        env: { ...process.env },
      });
      
      child.on('close', (code) => {
        if (code === 0) {
          console.log('Database initialized');
          initialized = true;
          resolve();
        } else {
          reject(new Error('Database initialization failed'));
        }
      });
      
      child.on('error', reject);
    });
  } catch (err) {
    console.error('Error initializing database:', err);
  }
}
