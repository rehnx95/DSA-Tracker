import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';

function ProfileSettings({ userId, profile, onBack, onSaved }) {
  const [form, setForm] = useState({
    name: profile?.name || '',
    username: profile?.username || '',
    location: profile?.location || '',
    website: profile?.website || '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const closeTimer = useRef(null);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm(current => ({
      ...current,
      [name]: name === 'username' ? value.toLowerCase() : value,
    }));
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const values = {
      name: form.name.trim(),
      username: form.username.trim().toLowerCase(),
      location: form.location.trim(),
      website: form.website.trim(),
    };

    if (!values.name) {
      setErrorMessage('Name is required.');
      return;
    }
    if (!/^(?=.*[a-z0-9])[a-z0-9-]{3,30}$/.test(values.username)) {
      setErrorMessage('Username must be 3–30 characters using lowercase letters, numbers, and hyphens.');
      return;
    }
    if (values.website) {
      try {
        const websiteUrl = new URL(values.website);
        if (!['http:', 'https:'].includes(websiteUrl.protocol)) throw new Error('Invalid URL protocol');
      } catch {
        setErrorMessage('Enter a valid website URL starting with http:// or https://.');
        return;
      }
    }

    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const { data: isAvailable, error: availabilityError } = await supabase.rpc('is_username_available', {
        candidate_username: values.username,
      });
      if (availabilityError) throw availabilityError;
      if (!isAvailable) {
        setErrorMessage('That username is already taken.');
        return;
      }

      const { data: savedProfile, error } = await supabase
        .from('profiles')
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select('id, name, username, location, website, onboarding_completed')
        .single();
      if (error) throw error;

      onSaved(savedProfile);
      setSuccessMessage('Profile updated successfully.');
      closeTimer.current = setTimeout(onBack, 2000);
    } catch (saveError) {
      console.error('Failed to update profile:', saveError);
      setErrorMessage(saveError.code === '23505'
        ? 'That username is already taken.'
        : 'Could not save your profile. Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="profile-settings-shell min-h-screen bg-[#0B0B0F] text-[#E8E8EE] font-sans">
      <header className="dashboard-header sticky top-0 z-50 bg-[#0B0B0F]/80 backdrop-blur-xl border-b border-[#26262F]">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to profile"
            className="p-2 rounded-lg hover:bg-[#1C1C24] transition-colors"
          >
            <ChevronDown size={20} className="rotate-90" />
          </button>
          <h1 className="font-bold text-xl">Edit profile</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-8">
        <form onSubmit={handleSubmit} className="settings-form space-y-5 rounded-2xl border border-[#26262F] bg-[#15151B] p-6 md:p-8">
          {errorMessage && (
            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-900/20 p-3 text-sm text-red-300">
              {errorMessage}
            </p>
          )}
          {successMessage && (
            <p role="status" className="rounded-lg border border-green-500/30 bg-green-900/20 p-3 text-sm text-green-300">
              {successMessage}
            </p>
          )}

          {[
            { name: 'name', label: 'Name', type: 'text', required: true, maxLength: 100 },
            { name: 'username', label: 'Username', type: 'text', required: true, maxLength: 30 },
            { name: 'location', label: 'Location', type: 'text', maxLength: 100 },
            { name: 'website', label: 'Website / URL', type: 'url', placeholder: 'https://example.com', maxLength: 2048 },
          ].map(field => (
            <div key={field.name}>
              <label htmlFor={`profile-${field.name}`} className="mb-2 block text-sm font-medium">
                {field.label}
              </label>
              <input
                id={`profile-${field.name}`}
                name={field.name}
                type={field.type}
                required={field.required}
                maxLength={field.maxLength}
                placeholder={field.placeholder}
                value={form[field.name]}
                onChange={handleChange}
                className="w-full rounded-lg border border-[#26262F] bg-[#0B0B0F] px-4 py-3 text-[#E8E8EE] placeholder-[#8A8A98] focus:border-[#6D5BF6] focus:outline-none focus:ring-2 focus:ring-[#6D5BF6]"
              />
              {field.name === 'username' && (
                <p className="mt-1 text-xs text-[#8A8A98]">3–30 characters; lowercase letters, numbers, and hyphens.</p>
              )}
            </div>
          ))}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-lg bg-[#6D5BF6] px-4 py-3 font-medium text-white transition-colors hover:bg-[#5B4AD6] disabled:cursor-wait disabled:opacity-60"
          >
            {isSaving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </main>
    </div>
  );
}

export default ProfileSettings;
