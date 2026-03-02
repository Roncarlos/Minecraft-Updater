import ConfigImportPanel from './ConfigImportPanel';
import { useConfigs } from '../../hooks/useConfigs';

interface ConfigManagerProps {
  presetId: string;
  onRefresh: () => Promise<void>;
}

export default function ConfigManager({ presetId, onRefresh }: ConfigManagerProps) {
  const configs = useConfigs(presetId);

  return (
    <div className="mb-3">
      <ConfigImportPanel
        onImport={(folderPath) => configs.importFromFolder(folderPath, onRefresh)}
        onUpload={(targetPath, content) => configs.upload(targetPath, content, onRefresh)}
        importing={configs.importing}
        uploading={configs.uploading}
      />
      {configs.error && (
        <div className="text-danger text-[0.8rem] mt-1">{configs.error}</div>
      )}
    </div>
  );
}
