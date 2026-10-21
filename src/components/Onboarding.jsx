import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { CheckSquare, User, MapPin, Globe, ArrowRight, Loader2 } from 'lucide-react';

function Onboarding({ user, onComplete }) {
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    location: '',
    website: ''
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  // Check if username is available in real-time
  useEffect(() => {
    if (!formData.username) return;

    const timeoutId = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', formData.username)
          .single();

        setUsernameAvailable(!data);
      } catch (error) {
        setUsernameAvailable(null);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [formData.username]);

  // Load existing profile data on component mount
  useEffect(() => {
    if (!user) return;

    const loadProfileData = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('name, username, location, website')
          .eq('id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = not found
          throw error;
        }

        if (data) {
          setProfileData(data);
          // If user already has a profile, populate form (read-only)
          if (data.name || data.username) {
            setFormData({
              name: data.name || '',
              username: data.username || '',
              location: data.location || '',
              website: data.website || ''
            });
          }
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      }
    };

    loadProfileData();
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Auto-generate username from name if not manually set and profile is new
    if (name === 'name' && !formData.username && !profileData?.username) {
      const generatedUsername = value
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      if (generatedUsername) {
        setFormData(prev => ({ ...prev, username: generatedUsername }));
      }
    }

    // Clear errors
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    } else if (!/^[a-z0-9-]+$/.test(formData.username)) {
      newErrors.username = 'Username can only contain lowercase letters, numbers, and hyphens';
    } else if (usernameAvailable === false) {
      newErrors.username = 'Username is already taken';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      // Check if this is an update to existing profile or new profile
      const isUpdate = !!profileData?.username;

      if (isUpdate) {
        // Update existing profile
        const { error } = await supabase
          .from('profiles')
          .update({
            name: formData.name,
            username: formData.username,
            bio: '',
            location: formData.location,
            website: formData.website,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (error) throw error;
      } else {
        // Create new profile (should happen via trigger on auth)
        // But we'll allow this for backward compatibility
        const { error } = await supabase
          .from('profiles')
          .insert({
            id: user.id,
            name: formData.name,
            username: formData.username,
            bio: '',
            location: formData.location,
            website: formData.website,
            updated_at: new Date().toISOString()
          });

        if (error) throw error;
      }

      setHasCompletedOnboarding(true);
      onComplete();
    } catch (error) {
      console.error('Onboarding error:', error);
      setErrors({ submit: 'Failed to save profile. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  // Check if profile is complete
  const isProfileComplete = () => {
    return profileData &&
           profileData.name &&
           profileData.username &&
           hasCompletedOnboarding;
  };

  // If profile is already complete, don't show onboarding
  if (isProfileComplete()) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0B0B0F] text-[#E8E8EE] font-sans flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#6D5BF6] to-[#8B7CFD] flex items-center justify-center shadow-lg shadow-[#6D5BF6]/30 mb-4">
            <CheckSquare size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[#E8E8EE] mb-2">Welcome! Complete Your Profile</h1>
          <p className="text-[#8A8A98]">
            {profileData?.username
              ? "Let's update your profile information"
              : "Let's set up your Track Sheet account with some basic information"}
          </p>
        </div>

        <div className="bg-[#15151B] rounded-2xl border border-[#26262F] p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {errors.submit && (
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                {errors.submit}
              </div>
            )}

            {/* Name Field */}
            <div>
              <label className="block text-sm font-medium text-[#E8E8EE] mb-2">
                Full Name <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <User size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A98]" />
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Enter your full name"
                  className={`w-full pl-10 pr-4 py-3 bg-[#0B0B0F] border rounded-lg text-[#E8E8EE] placeholder-[#8A8A98] focus:outline-none focus:ring-2 focus:ring-[#6D5BF6] focus:border-transparent transition-all ${errors.name ? 'border-red-500' : 'border-[#26262F]'}`}
                />
              </div>
              {errors.name && <p className="text-red-400 text-sm mt-1">{errors.name}</p>}
            </div>

            {/* Username Field */}
            <div>
              <label className="block text-sm font-medium text-[#E8E8EE] mb-2">
                Username <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <User size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A98]" />
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="Choose a username"
                  disabled={profileData?.username} // Disable if updating existing
                  className={`w-full pl-10 pr-4 py-3 bg-[#0B0B0F] border rounded-lg text-[#E8E8EE] placeholder-[#8A8A98] focus:outline-none focus:ring-2 focus:ring-[#6D5BF6] focus:border-transparent transition-all ${errors.username || usernameAvailable === false ? 'border-red-500' : usernameAvailable === true ? 'border-green-500' : 'border-[#26262F]'} ${profileData?.username ? 'bg-[#0B0B0F]/50 cursor-not-allowed' : ''}`}
                />
                {usernameAvailable === true && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="text-green-400 text-sm">✓ Available</span>
                  </div>
                )}
                {usernameAvailable === false && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="text-red-400 text-sm">✗ Taken</span>
                  </div>
                )}
              </div>
              {profileData?.username ? (
                <p className="text-xs text-[#8A8A98] mt-1">Username cannot be changed after initial setup</p>
              ) : (
                <p className="text-xs text-[#8A8A98] mt-1">Only lowercase letters, numbers, and hyphens allowed</p>
              )}
              {errors.username && <p className="text-red-400 text-sm mt-1">{errors.username}</p>}
            </div>

            {/* Location Field */}
            <div>
              <label className="block text-sm font-medium text-[#E8E8EE] mb-2">
                Location
              </label>
              <div className="relative">
                <MapPin size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A98]" />
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="Where are you located?"
                  className="w-full pl-10 pr-4 py-3 bg-[#0B0B0F] border border-[#26262F] rounded-lg text-[#E8E8EE] placeholder-[#8A8A98] focus:outline-none focus:ring-2 focus:ring-[#6D5BF6] focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Website Field */}
            <div>
              <label className="block text-sm font-medium text-[#E8E8EE] mb-2">
                Website
              </label>
              <div className="relative">
                <Globe size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A98]" />
                <input
                  type="url"
                  name="website"
                  value={formData.website}
                  onChange={handleChange}
                  placeholder="https://yourwebsite.com"
                  className="w-full pl-10 pr-4 py-3 bg-[#0B0B0F] border border-[#26262F] rounded-lg text-[#E8E8EE] placeholder-[#8A8A98] focus:outline-none focus:ring-2 focus:ring-[#6D5BF6] focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || usernameAvailable === false || profileData?.username}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#6D5BF6] hover:bg-[#5B4AD6] disabled:bg-[#26262F] disabled:text-[#8A8A98] text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#6D5BF6] focus:ring-offset-2 focus:ring-offset-[#0B0B0F]"
            >
              {isLoading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : profileData?.username ? (
                "Update Profile"
              ) : (
                <>Complete Setup <ArrowRight size={20} /></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
