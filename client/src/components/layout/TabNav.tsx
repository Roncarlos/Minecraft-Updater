export type TabId = 'updater' | 'modifier';

interface TabNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'updater', label: 'Mod Updater' },
  { id: 'modifier', label: 'Modpack Modifier' },
];

export default function TabNav({ activeTab, onTabChange }: TabNavProps) {
  return (
    <div className="flex gap-1 mb-4 border-b border-border">
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={`px-5 py-2.5 text-[0.9rem] font-semibold cursor-pointer rounded-t-lg border border-b-0 transition-colors ${
            activeTab === id
              ? 'bg-surface border-border text-text'
              : 'bg-transparent border-transparent text-muted hover:text-text hover:bg-surface-hover'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
