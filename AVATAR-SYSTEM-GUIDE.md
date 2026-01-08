# Avatar Upload System - Usage Guide

## Overview
This system allows users to upload and display profile pictures/avatars throughout your StockLoyal app. The avatar appears in:
- Header (next to menu button)
- Social feed comments
- User profile
- Any other location where you display user info

## Components

### 1. **AvatarUpload.jsx**
Upload and edit component - use this in profile/onboarding pages
- Click-to-upload functionality
- Image preview modal
- Remove avatar option
- Stores in localStorage (can be changed to API)

### 2. **UserAvatar.jsx**
Display component - use this everywhere you need to show avatars
- Consistent styling across app
- Fallback to User icon if no avatar
- Multiple size options
- Optional online indicator

### 3. **Updated Components**
- **Onboard.jsx** - Includes avatar upload in onboarding
- **Header.jsx** - Displays user avatar next to menu

## Installation

### Step 1: Place Files
```
src/
├── components/
│   ├── AvatarUpload.jsx     ← Upload component
│   ├── UserAvatar.jsx       ← Display component
│   └── Header.jsx           ← Updated with avatar
├── pages/
│   └── Onboard.jsx          ← Updated with avatar upload
```

### Step 2: Install Dependencies
These components use `lucide-react` which you already have:
- `Camera` icon
- `Upload` icon
- `X` icon
- `User` icon

No additional dependencies needed! ✅

## Usage Examples

### Example 1: Onboarding Page (Already Implemented)
```jsx
import AvatarUpload from '../components/AvatarUpload';

function Onboard() {
  const [avatar, setAvatar] = useState(null);

  useEffect(() => {
    const savedAvatar = localStorage.getItem('userAvatar');
    setAvatar(savedAvatar);
  }, []);

  return (
    <div>
      <AvatarUpload 
        currentAvatar={avatar}
        onAvatarChange={(newAvatar) => setAvatar(newAvatar)}
        size="xl"
      />
    </div>
  );
}
```

### Example 2: Display Avatar in Social Feed
```jsx
import UserAvatar from '../components/UserAvatar';

function Comment({ author, text, authorAvatar }) {
  return (
    <div style={{ display: 'flex', gap: '12px' }}>
      <UserAvatar 
        src={authorAvatar}
        alt={author}
        size="md"
      />
      <div>
        <strong>{author}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}
```

### Example 3: Profile Settings Page
```jsx
import AvatarUpload from '../components/AvatarUpload';
import UserAvatar from '../components/UserAvatar';

function ProfileSettings() {
  const [avatar, setAvatar] = useState(localStorage.getItem('userAvatar'));

  return (
    <div>
      <h2>Profile Settings</h2>
      
      {/* Editable avatar */}
      <AvatarUpload 
        currentAvatar={avatar}
        onAvatarChange={setAvatar}
        size="xl"
      />
      
      {/* Or just display */}
      <UserAvatar src={avatar} size="2xl" />
    </div>
  );
}
```

### Example 4: User List with Online Status
```jsx
import UserAvatar from '../components/UserAvatar';

function UserList({ users }) {
  return (
    <ul>
      {users.map(user => (
        <li key={user.id}>
          <UserAvatar 
            src={user.avatar}
            alt={user.name}
            size="md"
            showOnlineIndicator={true}
            isOnline={user.isOnline}
          />
          <span>{user.name}</span>
        </li>
      ))}
    </ul>
  );
}
```

## Component Props

### AvatarUpload Props
```typescript
{
  currentAvatar: string | null;      // Current avatar URL or base64
  onAvatarChange: (avatar) => void;  // Callback when avatar changes
  size: 'sm' | 'md' | 'lg' | 'xl';  // Size of upload button (default: 'lg')
}
```

### UserAvatar Props
```typescript
{
  src: string | null;                    // Avatar URL or base64
  alt: string;                           // Alt text (default: 'User')
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';  // Size (default: 'md')
  className: string;                     // Additional CSS classes
  style: object;                         // Additional inline styles
  showOnlineIndicator: boolean;          // Show online/offline dot (default: false)
  isOnline: boolean;                     // Online status (default: false)
}
```

## Size Reference

| Size | Container | Use Case |
|------|-----------|----------|
| xs   | 24px      | Tiny mentions, tags |
| sm   | 32px      | Comment replies, small lists |
| md   | 40px      | Header, comments, regular lists |
| lg   | 48px      | Profile cards, feature highlights |
| xl   | 64px      | Edit profile, large cards |
| 2xl  | 96px      | Profile page header |

## Storage Options

### Current: localStorage (Default)
```jsx
// Saved automatically in AvatarUpload component
localStorage.setItem('userAvatar', base64Image);
localStorage.getItem('userAvatar');
```

### Option A: Save to Backend API
Replace in `AvatarUpload.jsx`, line ~64:
```jsx
const handleSaveAvatar = async () => {
  setIsUploading(true);
  
  try {
    // Upload to your API
    const response = await apiPost('upload-avatar.php', {
      memberId: localStorage.getItem('memberId'),
      avatar: previewUrl, // base64 string
    });
    
    // Save URL returned from API
    const avatarUrl = response.avatarUrl;
    localStorage.setItem('userAvatar', avatarUrl);
    
    // Dispatch event
    window.dispatchEvent(new Event('avatar-updated'));
    
    if (onAvatarChange) {
      onAvatarChange(avatarUrl);
    }
    
    setShowModal(false);
  } catch (error) {
    console.error('Error saving avatar:', error);
    alert('Failed to save avatar');
  } finally {
    setIsUploading(false);
  }
};
```

### Option B: Backend PHP Example
```php
<?php
// upload-avatar.php
$data = json_decode(file_get_contents('php://input'), true);
$memberId = $data['memberId'];
$avatarBase64 = $data['avatar'];

// Remove data URI prefix
$avatarData = explode(',', $avatarBase64)[1];
$avatarDecoded = base64_decode($avatarData);

// Generate unique filename
$filename = 'avatar_' . $memberId . '_' . time() . '.jpg';
$filepath = '/uploads/avatars/' . $filename;

// Save file
file_put_contents($filepath, $avatarDecoded);

// Return URL
echo json_encode([
  'success' => true,
  'avatarUrl' => 'https://api.stockloyal.com/uploads/avatars/' . $filename
]);
?>
```

## Integration with Social Feed

Update your social comments to display avatars:

```jsx
// In your SocialFeed or Comment component
import UserAvatar from '../components/UserAvatar';

function Comment({ comment }) {
  // Get avatar from comment data or localStorage
  const avatarSrc = comment.authorAvatar || 
                   (comment.authorId === currentUserId ? 
                    localStorage.getItem('userAvatar') : null);

  return (
    <div style={{ display: 'flex', gap: '12px', padding: '12px' }}>
      <UserAvatar 
        src={avatarSrc}
        alt={comment.authorName}
        size="md"
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: '600' }}>{comment.authorName}</div>
        <p style={{ color: '#374151' }}>{comment.text}</p>
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>
          {comment.timestamp}
        </span>
      </div>
    </div>
  );
}
```

## File Size & Validation

The upload component includes:
- **Max file size**: 5MB (line ~35 in AvatarUpload.jsx)
- **File type validation**: Images only
- **Preview before save**: Users see preview modal before confirming

To change the limit:
```jsx
// In AvatarUpload.jsx, line ~35
if (file.size > 10 * 1024 * 1024) {  // Change to 10MB
  alert('Image must be less than 10MB');
  return;
}
```

## Real-time Updates

The system uses custom events to update avatars across the app instantly:

```jsx
// When avatar is saved (automatically done)
window.dispatchEvent(new Event('avatar-updated'));

// Header listens for this event
window.addEventListener('avatar-updated', () => {
  const savedAvatar = localStorage.getItem('userAvatar');
  setUserAvatar(savedAvatar);
});
```

This means when a user uploads an avatar:
1. It saves to storage
2. Event fires
3. Header updates immediately (no page refresh needed)
4. All components using UserAvatar can listen for updates

## Styling Customization

### Change Avatar Border Color
In `UserAvatar.jsx`, line ~45:
```jsx
border: `${config.border}px solid #2563eb`,  // Blue border
```

### Change Default Background
In `UserAvatar.jsx`, line ~42:
```jsx
backgroundColor: src ? 'transparent' : '#eff6ff',  // Light blue background
```

### Customize Upload Button Color
In `AvatarUpload.jsx`, line ~100:
```jsx
backgroundColor: '#2563eb',  // Blue button
```

## Troubleshooting

**Avatar not showing:**
- Check browser console for errors
- Verify file path: `src/components/UserAvatar.jsx`
- Check localStorage: `localStorage.getItem('userAvatar')`

**Image too large error:**
- Current limit is 5MB
- Compress image before upload
- Or increase limit in AvatarUpload.jsx

**Avatar not updating in header:**
- Check if event is firing: `console.log` in Header useEffect
- Verify localStorage is being set
- Hard refresh browser (Ctrl+Shift+R)

**CORS errors when loading image:**
- If using external URLs, server must allow CORS
- Use base64 or same-origin URLs for best compatibility

## Next Steps

1. ✅ Place all component files in correct directories
2. ✅ Update Header.jsx with avatar version
3. ✅ Update Onboard.jsx with avatar upload
4. 🔄 Add avatar display to social feed comments
5. 🔄 (Optional) Implement backend API for avatar storage
6. 🔄 (Optional) Add image cropping functionality

## Advanced: Image Cropping

Want to add image cropping? Consider using:
- `react-easy-crop` library
- `react-image-crop` library

Example integration:
```jsx
import Cropper from 'react-easy-crop';

// Add crop state and logic to AvatarUpload component
// Then apply crop before saving
```

This would allow users to crop/zoom their images before uploading!
