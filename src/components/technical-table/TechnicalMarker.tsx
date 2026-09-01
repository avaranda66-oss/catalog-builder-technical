import React from 'react';
import { TechnicalMarkerType } from './table-tokens';

interface TechnicalMarkerProps {
  type: TechnicalMarkerType;
  className?: string;
  size?: number;
  color?: string;
  title?: string;
}

export const TechnicalMarker: React.FC<TechnicalMarkerProps> = ({
  type,
  className = '',
  size = 12,
  color = 'currentColor',
  title
}) => {
  const commonProps = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    className: `inline-block align-middle select-none ${className}`,
    'aria-label': title || type
  };

  switch (type) {
    case 'filled_square':
      return (
        <svg {...commonProps}>
          <rect x="2" y="2" width="12" height="12" fill={color} />
        </svg>
      );

    case 'empty_square':
      return (
        <svg {...commonProps}>
          <rect x="2.5" y="2.5" width="11" height="11" stroke={color} strokeWidth="1.5" fill="none" />
        </svg>
      );

    case 'filled_circle':
      return (
        <svg {...commonProps}>
          <circle cx="8" cy="8" r="6" fill={color} />
        </svg>
      );

    case 'empty_circle':
      return (
        <svg {...commonProps}>
          <circle cx="8" cy="8" r="5.5" stroke={color} strokeWidth="1.5" fill="none" />
        </svg>
      );

    case 'asterisk':
      return (
        <span
          style={{ fontSize: `${size + 2}px`, color }}
          className={`font-mono font-bold leading-none select-none ${className}`}
          title={title || 'Nota Técnica (*)'}
        >
          *
        </span>
      );

    case 'double_asterisk':
      return (
        <span
          style={{ fontSize: `${size + 2}px`, color }}
          className={`font-mono font-bold leading-none select-none ${className}`}
          title={title || 'Nota Técnica (**)'}
        >
          **
        </span>
      );

    case 'dash':
    default:
      return (
        <span
          style={{ color }}
          className={`font-mono font-normal leading-none select-none opacity-60 ${className}`}
          title={title || 'Não aplicável (—)'}
        >
          —
        </span>
      );
  }
};
