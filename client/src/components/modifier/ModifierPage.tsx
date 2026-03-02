import { useAppContext } from '../../context';
import { usePresets } from '../../hooks/usePresets';
import PresetSidebar from './PresetSidebar';
import PresetEditor from './PresetEditor';

export default function ModifierPage() {
  const { state, openModal } = useAppContext();
  const presets = usePresets();

  return (
    <div className="flex gap-6 min-h-[600px]">
      <PresetSidebar
        presets={presets.presets}
        selectedId={presets.selectedId}
        onSelect={presets.select}
        onCreate={presets.create}
        onDelete={presets.remove}
        loading={presets.loading}
      />
      <div className="flex-1">
        {presets.selected ? (
          <PresetEditor
            key={presets.selected.id}
            preset={presets.selected}
            instances={state.instances}
            onUpdate={presets.update}
            onRefresh={presets.refresh}
            openModal={openModal}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted text-[0.9rem]">
            Select or create a preset to get started
          </div>
        )}
      </div>
    </div>
  );
}
