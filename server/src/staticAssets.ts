import fs from 'fs';
import path from 'path';

interface ResolvePublicDirOptions {
  runtimeDir: string;
  serverRoot: string;
  nodeEnv?: string;
  publicDirEnv?: string;
  webappExists?: boolean;
}

export const resolvePublicDir = ({
  runtimeDir,
  serverRoot,
  nodeEnv = process.env.NODE_ENV,
  publicDirEnv = process.env.PUBLIC_DIR,
  webappExists,
}: ResolvePublicDirOptions) => {
  if (publicDirEnv) {
    return path.resolve(publicDirEnv);
  }

  const builtPublic = path.resolve(runtimeDir, 'public');
  const sourceWebapp = path.resolve(serverRoot, '..', 'webapp');
  const hasSourceWebapp = webappExists ?? fs.existsSync(sourceWebapp);

  if (nodeEnv !== 'production' && hasSourceWebapp) {
    return sourceWebapp;
  }

  return builtPublic;
};
