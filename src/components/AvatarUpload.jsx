import React, { useState, useRef } from 'react';
import { Camera, Upload, X, User } from 'lucide-react';

/**
 * AvatarUpload Component
 * Allows users to upload and crop their profile picture
 */
const AvatarUpload = ({ currentAvatar, onAvatarChange, size = 'lg' }) => {
  const [previewUrl, setPreviewUrl] = useState(currentAvatar || null);
  const [isUploading, setIsUploading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const fileInputRef = useRef(null);

  // Size configurations
  const sizeConfig = {
    sm: { container: 40, icon: 16, text: 'text-xs' },
    md: { container: 64, icon: 20, text: 'text-sm' },
    lg: { container: 96, icon: 24, text: 'text-base' },
    xl: { container: 128, icon: 32, text: 'text-lg' },
  };

  const config = sizeConfig[size] || sizeConfig.lg;

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      setPreviewUrl(result);
      setShowModal(true);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAvatar = async () => {
    setIsUploading(true);
    
    try {
      // Save to localStorage (you can replace this with API call)
      localStorage.setItem('userAvatar', previewUrl);
      
      // Dispatch custom event for same-tab updates
      window.dispatchEvent(new Event('avatar-updated'));
      
      // Call parent callback
      if (onAvatarChange) {
        onAvatarChange(previewUrl);
      }
      
      setShowModal(false);
    } catch (error) {
      console.error('Error saving avatar:', error);
      alert('Failed to save avatar');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveAvatar = () => {
    setPreviewUrl(null);
    localStorage.removeItem('userAvatar');
    
    // Dispatch custom event for same-tab updates
    window.dispatchEvent(new Event('avatar-updated'));
    
    if (onAvatarChange) {
      onAvatarChange(null);
    }
    setShowModal(false);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      {/* Avatar Display & Upload Button */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {/* Avatar Circle */}
        <div
          style={{
            width: config.container,
            height: config.container,
            borderRadius: '50%',
            backgroundColor: previewUrl ? 'transparent' : '#e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            border: '2px solid #d1d5db',
            cursor: 'pointer',
          }}
          onClick={triggerFileInput}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Avatar"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <User
              size={config.icon}
              style={{ color: '#9ca3af' }}
              strokeWidth={2}
            />
          )}
        </div>

        {/* Upload Button Overlay */}
        <button
          onClick={triggerFileInput}
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: config.container * 0.35,
            height: config.container * 0.35,
            borderRadius: '50%',
            backgroundColor: '#2563eb',
            border: '2px solid white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}
          title="Upload photo"
        >
          <Camera
            size={config.icon * 0.5}
            style={{ color: 'white' }}
            strokeWidth={2.5}
          />
        </button>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </div>

      {/* Preview & Confirm Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 9999,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              maxWidth: '400px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', margin: 0 }}>
                Profile Picture
              </h3>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  color: '#9ca3af',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <X size={24} />
              </button>
            </div>

            {/* Preview */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <div
                style={{
                  width: 200,
                  height: 200,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: '3px solid #e5e7eb',
                  backgroundColor: '#f3f4f6',
                }}
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={80} style={{ color: '#9ca3af' }} />
                  </div>
                )}
              </div>
            </div>

            {/* Instructions */}
            <p style={{ fontSize: '14px', color: '#6b7280', textAlign: 'center', marginBottom: '20px' }}>
              This photo will be shown on your profile and comments
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={handleSaveAvatar}
                disabled={isUploading}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  opacity: isUploading ? 0.6 : 1,
                }}
              >
                {isUploading ? 'Saving...' : 'Save Photo'}
              </button>

              <button
                onClick={triggerFileInput}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: 'white',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <Upload size={18} />
                Choose Different Photo
              </button>

              {currentAvatar && (
                <button
                  onClick={handleRemoveAvatar}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: 'white',
                    color: '#dc2626',
                    border: '1px solid #fca5a5',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  Remove Photo
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AvatarUpload;
