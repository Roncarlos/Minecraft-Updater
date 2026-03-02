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
        onImportFolder={(folderPath) => configs.importFromFolder(folderPath, onRefresh)}
        onImportFile={(filePath) => configs.importFile(filePath, onRefresh)}
        importing={configs.importing}
      />
      {configs.error && (
        <div className="text-danger text-[0.8rem] mt-1">{configs.error}</div>
      )}
    </div>
  );
}
