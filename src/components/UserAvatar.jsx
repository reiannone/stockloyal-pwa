import React from 'react';
import { User } from 'lucide-react';

/**
 * UserAvatar Component
 * Displays user avatar with fallback to User icon
 * Used consistently across Header, Social Feed, Comments, etc.
 */
const UserAvatar = ({ 
  src, 
  alt = 'User', 
  size = 'md', 
  className = '',
  style = {},
  showOnlineIndicator = false,
  isOnline = false,
}) => {
  // Size configurations
  const sizeConfig = {
    xs: { container: 24, icon: 12, border: 1, indicator: 6 },
    sm: { container: 32, icon: 16, border: 2, indicator: 8 },
    md: { container: 40, icon: 20, border: 2, indicator: 10 },
    lg: { container: 48, icon: 24, border: 2, indicator: 12 },
    xl: { container: 64, icon: 32, border: 3, indicator: 14 },
    '2xl': { container: 96, icon: 48, border: 3, indicator: 16 },
  };

  const config = sizeConfig[size] || sizeConfig.md;

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        display: 'inline-block',
        ...style,
      }}
    >
      <div
        style={{
          width: config.container,
          height: config.container,
          borderRadius: '50%',
          backgroundColor: src ? 'transparent' : '#e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          border: `${config.border}px solid #d1d5db`,
        }}
      >
        {src ? (
          <img
            src={src}
            alt={alt}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            onError={(e) => {
              // Fallback if image fails to load
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        
        {/* Fallback User Icon */}
        <div
          style={{
            display: src ? 'none' : 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
          }}
        >
          <User
            size={config.icon}
            style={{ color: '#9ca3af' }}
            strokeWidth={2}
          />
        </div>
      </div>

      {/* Online Indicator */}
      {showOnlineIndicator && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: config.indicator,
            height: config.indicator,
            borderRadius: '50%',
            backgroundColor: isOnline ? '#10b981' : '#6b7280',
            border: '2px solid white',
          }}
          title={isOnline ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
};

export default UserAvatar;
