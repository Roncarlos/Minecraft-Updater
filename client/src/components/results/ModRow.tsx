import { useAppContext } from '../../context';
import type { ModItem } from '../../types';
import RefLink from './RefLink';
import DepLink from './DepLink';
import LlmBadge from './LlmBadge';
import ActionButtons from './ActionButtons';

const rowBorderColors: Record<string, string> = {
  breaking: 'border-l-[3px] border-l-danger',
  caution: 'border-l-[3px] border-l-orange',
  'review-deps': 'border-l-[3px] border-l-purple',
  safe: 'border-l-[3px] border-l-cyan',
  update: 'border-l-[3px] border-l-warning',
  ok: 'border-l-[3px] border-l-success',
};

interface ModRowProps {
  item: ModItem;
  cssClass: string;
  showActions: boolean;
}

export default function ModRow({ item, cssClass, showActions }: ModRowProps) {
  const { openModal } = useAppContext();

  // Status/change column
  let changeContent: React.ReactNode = item.breakingReason
    ? item.breakingReason
    : item.hasUpdate ? 'Update available' : 'Up to date';

  if (item.llmChangelogs && item.llmChangelogs.length > 0) {
    const severities = item.llmChangelogs.map(e => e.llmAnalysis?.severity || 'safe');
    let worst: 'safe' | 'caution' | 'breaking' = 'safe';
    if (severities.includes('breaking')) worst = 'breaking';
    else if (severities.includes('caution')) worst = 'caution';

    changeContent = (
      <>
        <LlmBadge
          severity={worst}
          onClick={() => openModal({ type: 'changelog', addonId: item.addonID, modName: item.name })}
        />
        {' '}{changeContent}
      </>
    );
  } else if (item.flaggedChangelogs && item.flaggedChangelogs.length > 0) {
    const n = item.flaggedChangelogs.length;
    changeContent = (
      <>
        <span
          className="cursor-pointer text-danger text-[0.85rem] mr-1 hover:text-warning"
          onClick={() => openModal({ type: 'changelog', addonId: item.addonID, modName: item.name })}
        >
          &#9888;{n}
        </span>
        {' '}{changeContent}
      </>
    );
  }

  const borderClass = rowBorderColors[cssClass] || '';

  return (
    <tr className="hover:bg-surface-hover">
      <td className={`px-4 py-2 border-b border-border text-[0.9rem] max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap ${borderClass}`}>
        {item.url ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer">{item.name}</a>
        ) : (
          item.name
        )}
      </td>
      <td className="px-4 py-2 border-b border-border text-[0.9rem] max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap">
        {item.installedFile || '-'}
      </td>
      <td className="px-4 py-2 border-b border-border text-[0.9rem] max-w-[300px] overflow-hidden text-ellipsis whitespace-nowrap">
        {item.latestFile || '-'}
      </td>
      <td className="px-4 py-2 border-b border-border text-[0.9rem]">
        <RefLink
          count={item.refs || 0}
          severity={item.refSeverity?.severity || ''}
          onClick={() => openModal({ type: 'refs', addonId: item.addonID, modName: item.name })}
        />
      </td>
      <td className="px-4 py-2 border-b border-border text-[0.9rem]">
        <DepLink
          addonId={item.addonID}
          deps={item.dependencies || []}
          onClick={() => openModal({ type: 'deps', addonId: item.addonID, modName: item.name })}
        />
      </td>
      <td className="px-4 py-2 border-b border-border text-[0.9rem]">
        {changeContent}
      </td>
      {showActions && (
        <td className="px-4 py-2 border-b border-border text-[0.9rem]">
          <ActionButtons item={item} />
        </td>
      )}
    </tr>
  );
}
