import React, { useState, useEffect, useRef, useCallback } from 'react';
import UnisLogo from '../../assets/unisLogoThree.svg';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Animated, 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import axiosInstance from '../services/axiosInstance';
import buildUrl from '../utils/buildUrl'; // ★ canonical media URL builder (R2→CDN rewrite + safe-encode), matches ProfileScreen/SupportedArtistPicker
import {
  X,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertCircle,
  User,
  Mail,
  Lock,
  MapPin,
  Music,
  Headphones,
  Mic2,
  Image as ImageIcon,
  FileAudio,
  Search,
  Play,
  Pause,
  Square,
  CheckCircle2,
  XCircle,
  Info,
  Gift,
  Users,
  Sparkles,
  Heart,
} from 'lucide-react-native';
import { JURISDICTION_IDS, GENRE_IDS } from '../utils/IdMappings';



// ============================================================================
// CONSTANTS
// ============================================================================
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const IS_MOBILE = SCREEN_WIDTH < 768;

const COLORS = {
  bgBlack: '#000000',
  bgDark: '#0a0a0a',
  textSilver: '#C0C0C0',
  textGray: '#A9A9A9',
  accentWhite: '#FFFFFF',
  unisBlue: '#163387',
  unisBlueBright: '#4a90d9',
  gradientTeal: '#14b8a6',
  gradientGreen: '#22c55e',
  gradientPurple: '#f97316',
  errorRed: '#ef4444',
  successGreen: '#22c55e',
  warningAmber: '#f59e0b',
  cardBg: 'rgba(255, 255, 255, 0.03)',
  borderSubtle: 'rgba(255, 255, 255, 0.1)',
};



// ============================================================================
// INTERFACES
// ============================================================================
interface FormData {
  referralCode: string;
  referrerUsername: string;
  username: string;
  email: string;
  password: string;
  passwordConfirm: string;
  jurisdictionId: string;
  jurisdictionName: string;
  role: string;
  listenerPhotoUri: string | null;
  bio: string;
  artistPhotoUri: string | null;
  genreId: string;
  songTitle: string;
  songFileUri: string | null;
  songFileName: string;
  songArtworkUri: string | null;
  supportedArtistId: string | null;
  supportedArtistName: string;
  agreedToTerms: boolean;
  agreedToArtistTerms: boolean;
  address: string;
  detectingLocation: boolean;
  // ★ parity with web register payload
  dateOfBirth: string | null;
  gender: string | null;
  themePreference: string;
  songIsrc: string;
}

interface ValidationState {
  checking: boolean;
  valid: boolean | null;
  message: string;
}

interface Artist {
  userId: string;
  username: string;
  photoUrl: string | null;
  defaultSongId?: string;
  defaultSong?: {
    title: string;
    fileUrl: string;
  };
  jurisdiction?: {
    jurisdictionId: string;
    name: string;
  };
}

interface StepConfig {
  id: string;
  title: string;
}

interface CreateAccountWizardProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
// ★ Theme options — mirrors web THEME_OPTIONS + ThemePicker.tsx ids/colors.
// The mobile app itself uses a fixed COLORS palette; this selection is stored
// as the account's themePreference (the web app honors it after sign-in).
const THEME_SWATCHES: { id: string; label: string; color: string }[] = [
  { id: 'blue',   label: 'Blue',   color: '#163387' },
  { id: 'orange', label: 'Orange', color: '#C44B0A' },
  { id: 'red',    label: 'Red',    color: '#B51C24' },
  { id: 'green',  label: 'Green',  color: '#0F7A3E' },
  { id: 'purple', label: 'Purple', color: '#4A1A8C' },
  { id: 'yellow', label: 'Gold',   color: '#C49A0A' },
  { id: 'dianna', label: 'Dianna', color: '#C8A84B' },
];

const debounce = <T extends (...args: any[]) => any>(func: T, wait: number) => {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// ★ Age from a YYYY-MM-DD string (parity with web's DOB gating). Returns null if unparseable.
const computeAge = (dobString: string | null): number | null => {
  if (!dobString) return null;
  const dob = new Date(dobString);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
};

// ★ Digits → YYYY-MM-DD mask as the user types (dependency-free DOB entry).
const maskDob = (raw: string): string => {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
};

// ============================================================================
// DUMMY DATA (for development)
// ============================================================================
const DUMMY_ARTISTS: Artist[] = [
  {
    userId: 'artist-001',
    username: 'The Quiet',
    photoUrl: null,
    defaultSongId: 'song-001',
    defaultSong: { title: 'Midnight in Harlem', fileUrl: '' },
    jurisdiction: { jurisdictionId: JURISDICTION_IDS['uptown-harlem'], name: 'Uptown Harlem' },
  },
  {
    userId: 'artist-002',
    username: 'Tony Fadd',
    photoUrl: null,
    defaultSongId: 'song-002',
    defaultSong: { title: 'Block Party', fileUrl: '' },
    jurisdiction: { jurisdictionId: JURISDICTION_IDS['downtown-harlem'], name: 'Downtown Harlem' },
  },
  {
    userId: 'artist-003',
    username: 'SD Boomin',
    photoUrl: null,
    defaultSongId: 'song-003',
    defaultSong: { title: 'Uptown Vibes', fileUrl: '' },
    jurisdiction: { jurisdictionId: JURISDICTION_IDS['uptown-harlem'], name: 'Uptown Harlem' },
  },
  {
    userId: 'artist-004',
    username: 'Harlem Rose',
    photoUrl: null,
    defaultSongId: 'song-004',
    defaultSong: { title: 'City Dreams', fileUrl: '' },
    jurisdiction: { jurisdictionId: JURISDICTION_IDS['downtown-harlem'], name: 'Downtown Harlem' },
  },
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const CreateAccountWizard: React.FC<CreateAccountWizardProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  // Step state
  const [currentStep, setCurrentStep] = useState(1);

  // Form data
  const [formData, setFormData] = useState<FormData>({
    referralCode: '',
    referrerUsername: '',
    username: '',
    email: '',
    password: '',
    passwordConfirm: '',
    jurisdictionId: '',
    jurisdictionName: '',
    role: '',
    listenerPhotoUri: null,
    bio: '',
    artistPhotoUri: null,
    genreId: '',
    songTitle: '',
    songFileUri: null,
    songFileName: '',
    songArtworkUri: null,
    supportedArtistId: null,
    supportedArtistName: '',
    agreedToTerms: false,
    agreedToArtistTerms: false,
    address: '',
    detectingLocation: false,
    dateOfBirth: null,
    gender: null,
    themePreference: 'blue',
    songIsrc: '',
  });

  // Validation state
  const [validation, setValidation] = useState<Record<string, ValidationState>>({
    referralCode: { checking: false, valid: null, message: '' },
    username: { checking: false, valid: null, message: '' },
    email: { checking: false, valid: null, message: '' },
    password: { checking: false, valid: null, message: '' },
    passwordConfirm: { checking: false, valid: null, message: '' },
  });

  // Artists for support selection
  const [artists, setArtists] = useState<Artist[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(false);
  const [artistSearch, setArtistSearch] = useState('');
  const [artistFilter, setArtistFilter] = useState('all');

  // Audio player
  const [playingArtistId, setPlayingArtistId] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  // Loading & status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  // ★ parity: phased submit + verify-email success screen
  const [partialSuccess, setPartialSuccess] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [submitPhase, setSubmitPhase] = useState<string | null>(null);

  // Scroll ref
  const scrollViewRef = useRef<ScrollView>(null);


  // Blinking animation for active step
  const blinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(blinkAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, []);



  // ============================================================================
  // STEP CONFIGURATION
  // ============================================================================
  const getSteps = (): StepConfig[] => {
    const baseSteps: StepConfig[] = [
      { id: 'welcome', title: 'Welcome' },
      { id: 'basicInfo', title: 'Your Details' },
      { id: 'location', title: 'Your Hood' },
      { id: 'role', title: 'Your Vibe' },
    ];

    if (formData.role === 'artist') {
      return [
        ...baseSteps,
        { id: 'artistProfile', title: 'Artist Profile' },
        { id: 'songUpload', title: 'Your Debut' },
        { id: 'supportArtist', title: 'Show Love' },
        { id: 'review', title: 'Ready!' },
      ];
    }

    return [
      ...baseSteps,
      { id: 'listenerProfile', title: 'Your Photo' },
      { id: 'listenerBio', title: 'Your Story' },
      { id: 'supportArtist', title: 'Show Love' },
      { id: 'review', title: 'Ready!' },
    ];
  };

  const steps = getSteps();
  const totalSteps = steps.length;
  const currentStepData = steps[currentStep - 1];

  // ============================================================================
  // FORM HELPERS
  // ============================================================================
  const updateForm = (key: keyof FormData, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const updateValidation = (key: string, data: Partial<ValidationState>) => {
    setValidation((prev) => ({ ...prev, [key]: { ...prev[key], ...data } }));
  };

  // ============================================================================
  // VALIDATION FUNCTIONS
  // ============================================================================
  const validateReferralCode = useCallback(
    debounce(async (code: string) => {
      if (!code || code.length < 3) {
        updateValidation('referralCode', { checking: false, valid: null, message: '' });
        return;
      }

      updateValidation('referralCode', { checking: true, valid: null, message: '' });

      try {
        const response = await axiosInstance.get(
          `/v1/users/validate-referral/${encodeURIComponent(code)}`
        );

        if (response.data?.valid) {
          updateValidation('referralCode', {
            checking: false,
            valid: true,
            message: `Referred by ${response.data.referrerUsername}`,
          });
          updateForm('referrerUsername', response.data.referrerUsername);
        } else {
          updateValidation('referralCode', {
            checking: false,
            valid: false,
            message: 'Invalid referral code',
          });
        }
      } catch (err) {
        // Launch-code fallback when the endpoint is unreachable.
        if (code === 'UNIS-LAUNCH-2024') {
          console.warn('[wizard] referral endpoint failed; applied launch-code fallback', err);
          updateValidation('referralCode', {
            checking: false,
            valid: true,
            message: 'Welcome early adopter!',
          });
          updateForm('referrerUsername', 'Unis');
        } else {
          console.error('[wizard] referral validation failed:', err);
          updateValidation('referralCode', {
            checking: false,
            valid: false,
            message: 'Could not verify code',
          });
        }
      }
    }, 500),
    []
  );

  const validateUsername = useCallback(
    debounce(async (username: string) => {
      if (!username || username.length < 3) {
        updateValidation('username', {
          checking: false,
          valid: null,
          message: username ? 'Username must be at least 3 characters' : '',
        });
        return;
      }

      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        updateValidation('username', {
          checking: false,
          valid: false,
          message: 'Only letters, numbers, and underscores',
        });
        return;
      }

      updateValidation('username', { checking: true, valid: null, message: '' });

      try {
        const response = await axiosInstance.get(
          `/v1/users/check-username?username=${encodeURIComponent(username)}`
        );

        updateValidation('username', {
          checking: false,
          valid: response.data?.available !== false,
          message:
            response.data?.available === false ? 'Username taken' : 'Username available!',
        });
      } catch (err) {
        // Fail open (don't block signup on a check outage); register 409 is the backstop.
        console.error('[wizard] username availability check failed:', err);
        updateValidation('username', { checking: false, valid: true, message: '' });
      }
    }, 500),
    []
  );

  const validateEmail = useCallback(
    debounce(async (email: string) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!email) {
        updateValidation('email', { checking: false, valid: null, message: '' });
        return;
      }

      if (!emailRegex.test(email)) {
        updateValidation('email', {
          checking: false,
          valid: false,
          message: 'Please enter a valid email',
        });
        return;
      }

      updateValidation('email', { checking: true, valid: null, message: '' });

      try {
        const response = await axiosInstance.get(
          `/v1/users/check-email?email=${encodeURIComponent(email)}`
        );

        updateValidation('email', {
          checking: false,
          valid: response.data?.available !== false,
          message: response.data?.available === false ? 'Email already registered' : '',
        });
      } catch (err) {
        // Fail open; register 409 is the backstop.
        console.error('[wizard] email availability check failed:', err);
        updateValidation('email', { checking: false, valid: true, message: '' });
      }
    }, 500),
    []
  );

  const validatePassword = (password: string) => {
    if (!password) {
      updateValidation('password', { checking: false, valid: null, message: '' });
      return;
    }

    if (password.length < 8) {
      updateValidation('password', {
        checking: false,
        valid: false,
        message: 'At least 8 characters required',
      });
      return;
    }

    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);

    if (hasUpper && hasLower && hasNumber) {
      updateValidation('password', { checking: false, valid: true, message: 'Strong password!' });
    } else {
      updateValidation('password', {
        checking: false,
        valid: true,
        message: 'Add uppercase, lowercase, and numbers for strength',
      });
    }

    if (formData.passwordConfirm) {
      validatePasswordConfirm(formData.passwordConfirm, password);
    }
  };

  const validatePasswordConfirm = (confirm: string, password: string = formData.password) => {
    if (!confirm) {
      updateValidation('passwordConfirm', { checking: false, valid: null, message: '' });
      return;
    }

    if (confirm !== password) {
      updateValidation('passwordConfirm', {
        checking: false,
        valid: false,
        message: 'Passwords do not match',
      });
    } else {
      updateValidation('passwordConfirm', {
        checking: false,
        valid: true,
        message: 'Passwords match!',
      });
    }
  };

  // ============================================================================
  // LOAD ARTISTS
  // ============================================================================
  useEffect(() => {
    if (currentStepData?.id === 'supportArtist' && artists.length === 0) {
      loadArtists();
    }
  }, [currentStepData?.id]);

  const loadArtists = async () => {
    setArtistsLoading(true);
    try {
      const response = await axiosInstance.get('/v1/users/artists/active');
      setArtists(response.data || []);
    } catch (err) {
      console.error('Failed to load artists:', err);
      setError('Could not load artists. Please try again.');
    } finally {
      setArtistsLoading(false);
    }
  };

  const filteredArtists = artists.filter((artist) => {
    const matchesSearch =
      !artistSearch || artist.username?.toLowerCase().includes(artistSearch.toLowerCase());
    const matchesFilter =
      artistFilter === 'all' || artist.jurisdiction?.jurisdictionId === artistFilter;
    return matchesSearch && matchesFilter;
  });

  // ============================================================================
  // AUDIO PLAYER
  // ============================================================================
  const playArtistPreview = async (artist: Artist) => {
    if (!artist.defaultSongId) return;

    // If same artist is playing, stop
    if (playingArtistId === artist.userId) {
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
      }
      setPlayingArtistId(null);
      return;
    }

    // Stop current playback
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
      setSound(null);
    }

    try {
      // Fetch the song details on demand since /artists/active
      // doesn't include the defaultSong object
      let songUrl: string | undefined;

      if (artist.defaultSong?.fileUrl) {
        songUrl = buildUrl(artist.defaultSong.fileUrl) ?? undefined;
      } else {
        // Fetch song data from the user's default-song endpoint
        const songRes = await axiosInstance.get(`/v1/users/${artist.userId}/default-song`);
        const songData = songRes.data;
        if (songData?.fileUrl) {
          songUrl = buildUrl(songData.fileUrl) ?? undefined;
        }
      }

      if (!songUrl) {
        Alert.alert('Unavailable', 'No preview available for this artist.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: songUrl },
        { shouldPlay: true }
      );

      setSound(newSound);
      setPlayingArtistId(artist.userId);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          newSound.unloadAsync();
          setSound(null);
          setPlayingArtistId(null);
        }
      });
    } catch (err) {
      console.error('Could not play preview:', err);
      setPlayingArtistId(null);
      Alert.alert('Error', 'Could not play audio preview.');
    }
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  // ============================================================================
  // FILE PICKERS
  // ============================================================================
  const pickImage = async (type: 'artist' | 'listener' | 'artwork') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'artwork' ? [1, 1] : undefined,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      if (type === 'artist') {
        updateForm('artistPhotoUri', uri);
      } else if (type === 'listener') {
        updateForm('listenerPhotoUri', uri);
      } else {
        updateForm('songArtworkUri', uri);
      }
    }
  };

  const pickAudioFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        updateForm('songFileUri', result.assets[0].uri);
        updateForm('songFileName', result.assets[0].name);
      }
    } catch (err) {
      console.error('Error picking audio:', err);
    }
  };

  // ============================================================================
  // LOCATION DETECTION
  // ============================================================================
  const detectLocation = async () => {
    if (!formData.address) return;

    setError('');
    updateForm('detectingLocation', true);

    try {
      // Geocode address using Nominatim
      const geoResponse = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
          `q=${encodeURIComponent(formData.address)}&format=json&limit=1`,
        { headers: { 'User-Agent': 'UnisMusic/1.0' } }
      );
      const geoData = await geoResponse.json();

      if (!geoData || geoData.length === 0) {
        setError('Address not found. Please try a more specific address.');
        updateForm('detectingLocation', false);
        return;
      }

      const lat = parseFloat(geoData[0].lat);
      const lon = parseFloat(geoData[0].lon);

      // Harlem boundaries (approximate)
      const HARLEM_BOUNDS = {
        north: 40.8282,
        south: 40.7967,
        east: -73.9262,
        west: -73.9595,
      };

      const DIVIDING_LINE = 40.8095; // 130th Street

      // Check if in Harlem
      if (
        lat < HARLEM_BOUNDS.south ||
        lat > HARLEM_BOUNDS.north ||
        lon < HARLEM_BOUNDS.west ||
        lon > HARLEM_BOUNDS.east
      ) {
        setError('Your address is not in Harlem. Unis is currently only available in Harlem, NY.');
        updateForm('detectingLocation', false);
        return;
      }

      // Determine Uptown vs Downtown
      if (lat >= DIVIDING_LINE) {
        updateForm('jurisdictionId', JURISDICTION_IDS['uptown-harlem']);
        updateForm('jurisdictionName', 'Uptown Harlem');
      } else {
        updateForm('jurisdictionId', JURISDICTION_IDS['downtown-harlem']);
        updateForm('jurisdictionName', 'Downtown Harlem');
      }
    } catch (err) {
      setError('Could not verify location. Please try again.');
    } finally {
      updateForm('detectingLocation', false);
    }
  };

  // ============================================================================
  // STEP VALIDATION
  // ============================================================================
  const canProceed = (): boolean => {
    switch (currentStepData?.id) {
      case 'welcome':
        return validation.referralCode.valid === true;
      case 'basicInfo': {
        const age = computeAge(formData.dateOfBirth);
        const dobValid = age !== null && age >= 13;
        return (
          formData.username.length >= 3 &&
          validation.username.valid !== false &&
          validation.email.valid !== false &&
          !!formData.email &&
          formData.password.length >= 8 &&
          formData.passwordConfirm === formData.password &&
          dobValid
        );
      }
      case 'location':
        return !!formData.jurisdictionId;
      case 'role':
        return !!formData.role;
      case 'artistProfile':
        return !!formData.artistPhotoUri && !!formData.genreId;
      case 'songUpload':
        return !!formData.songTitle.trim() && !!formData.songFileUri && !!formData.songArtworkUri;
      case 'listenerProfile':
        return !!formData.listenerPhotoUri;
      case 'listenerBio':
        return formData.bio.trim().length >= 10;
      case 'supportArtist':
        return !!formData.supportedArtistId;
      case 'review':
        return formData.role === 'artist'
          ? formData.agreedToTerms && formData.agreedToArtistTerms
          : formData.agreedToTerms;
      default:
        return true;
    }
  };

  // ============================================================================
  // NAVIGATION
  // ============================================================================
  const goNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep((prev) => prev + 1);
      setError('');
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const goBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      setError('');
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  // ============================================================================
  // SUBMIT
  // ============================================================================
const handleSubmit = async () => {
    setLoading(true);
    setError('');
    setSubmitPhase(null);
    setPartialSuccess(false);

    try {
      let photoUrl: string | null = null;

      // ---- Phase 1: Photo upload (anonymous endpoint) ----
      const photoUri = formData.role === 'artist'
        ? formData.artistPhotoUri
        : formData.listenerPhotoUri;

      if (photoUri) {
        setSubmitPhase('uploading-photo');
        try {
          const photoFormData = new FormData();
          photoFormData.append('photo', {
            uri: photoUri,
            type: 'image/jpeg',
            name: 'profile-photo.jpg',
          } as any);

          const photoResponse = await axiosInstance.patch(
            '/v1/users/profile/photo',
            photoFormData
          );
          photoUrl = photoResponse.data?.photoUrl ?? null;
        } catch (photoErr: any) {
          const status = photoErr.response?.status;
          const serverMsg = photoErr.response?.data?.message || '';
          console.error('[wizard] photo upload failed:', { status, serverMsg, err: photoErr?.message });
          let userMessage: string;
          if (status === 413 || /size|large/i.test(serverMsg)) {
            userMessage = "Your photo couldn't be uploaded — it's too large. Go back to the photo step and choose a smaller image.";
          } else if (status === 415 || /type|format/i.test(serverMsg)) {
            userMessage = 'Your photo format isn\'t supported. Go back and choose a JPG, PNG, WebP, or GIF.';
          } else if (status === 408 || photoErr.code === 'ECONNABORTED') {
            userMessage = 'The photo upload timed out — your connection may be slow. Try again or choose a smaller image.';
          } else {
            userMessage = `Your photo couldn't be uploaded (${serverMsg || 'server error'}). Go back and try a different image, or try again in a moment.`;
          }
          setError(userMessage);
          setSubmitPhase(null);
          setLoading(false);
          return;
        }
      }

      // ---- Phase 2: Account registration (creates an UNVERIFIED account) ----
      setSubmitPhase('creating-account');

      const registerPayload = {
        username: formData.username,
        email: formData.email,
        password: formData.password,
        role: formData.role,
        jurisdictionId: formData.jurisdictionId,
        supportedArtistId: formData.supportedArtistId,
        referralCode: formData.referralCode,
        bio: formData.bio || null,
        genreId: formData.role === 'artist' ? formData.genreId : null,
        photoUrl,
        dateOfBirth: formData.dateOfBirth || null,
        gender: formData.gender || null,
        themePreference: formData.themePreference || 'blue',
      };

      let reg: any;
      try {
        const registerResponse = await axiosInstance.post('/v1/users/register', registerPayload);
        reg = registerResponse.data; // { userId, role, signupToken, emailVerificationSent }
      } catch (regErr: any) {
        const serverMsg = regErr.response?.data?.message || '';
        const status = regErr.response?.status;
        console.error('[wizard] registration failed:', { status, serverMsg, err: regErr?.message });
        let userMessage: string;
        if (status === 409 || /already|taken|exists/i.test(serverMsg)) {
          userMessage = 'An account with this email or username already exists. Go back and use different credentials.';
        } else if (serverMsg) {
          userMessage = `Account creation failed: ${serverMsg}`;
        } else {
          userMessage = 'Account creation failed due to a server error. Please try again in a moment.';
        }
        setError(userMessage);
        setSubmitPhase(null);
        setLoading(false);
        return;
      }

      // ---- Phase 3: Artist debut song (token-authorized, NO login) ----
      if (formData.role === 'artist' && formData.songFileUri) {
        if (!reg.signupToken) {
          console.warn('[wizard] account created but no signupToken returned; deferring debut-song upload to dashboard', { userId: reg.userId });
          setPartialSuccess(true);
          setVerificationEmail(formData.email);
          setError("Your account was created, but we couldn't prepare the song upload. You can add your debut track from your dashboard after verifying your email.");
          setSubmitPhase(null);
          setLoading(false);
          return;
        }

        setSubmitPhase('uploading-song');
        try {
          const songData = {
            title: formData.songTitle,
            genreId: formData.genreId,
            jurisdictionId: formData.jurisdictionId,
            isrc: formData.songIsrc || null,
          };
          const songFormData = new FormData();
          songFormData.append('song', JSON.stringify(songData));
          songFormData.append('file', {
            uri: formData.songFileUri,
            type: 'audio/mpeg',
            name: formData.songFileName || 'song.mp3',
          } as any);
          if (formData.songArtworkUri) {
            songFormData.append('artwork', {
              uri: formData.songArtworkUri,
              type: 'image/jpeg',
              name: 'artwork.jpg',
            } as any);
          }

          await axiosInstance.post(
            `/v1/media/signup-song?signupToken=${encodeURIComponent(reg.signupToken)}`,
            songFormData
          );
        } catch (songErr: any) {
          const serverMsg = songErr.response?.data?.message || '';
          const status = songErr.response?.status;
          console.error('[wizard] debut-song upload failed (account already created):', { status, serverMsg, err: songErr?.message });
          setPartialSuccess(true);
          setVerificationEmail(formData.email);
          let detail: string;
          if (status === 413 || /size|large/i.test(serverMsg)) {
            detail = 'The audio file was too large.';
          } else if (serverMsg) {
            detail = serverMsg;
          } else {
            detail = 'a server error occurred';
          }
          setError(`Your account was created! However, your song couldn't be uploaded (${detail}). You can upload it from your dashboard after verifying your email.`);
          setSubmitPhase(null);
          setLoading(false);
          return;
        }
      }

      // ---- All phases succeeded — account created, verification email sent ----
      console.info('[wizard] account created (unverified); verification email sent', { role: reg.role, userId: reg.userId, songUploaded: formData.role === 'artist' && !!formData.songFileUri });
      setVerificationEmail(formData.email);
      setSubmitPhase(null);
      setSuccess(true);
      // No auto-login: the user must verify their email before signing in.
    } catch (err: any) {
      console.error('[wizard] unexpected submit failure:', err?.message || err);
      setSubmitPhase(null);
      setError(err.response?.data?.message || 'Something unexpected went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // RESET ON CLOSE
  // ============================================================================
  const handleClose = () => {
    setCurrentStep(1);
    setFormData({
      referralCode: '',
      referrerUsername: '',
      username: '',
      email: '',
      password: '',
      passwordConfirm: '',
      jurisdictionId: '',
      jurisdictionName: '',
      role: '',
      listenerPhotoUri: null,
      bio: '',
      artistPhotoUri: null,
      genreId: '',
      songTitle: '',
      songFileUri: null,
      songFileName: '',
      songArtworkUri: null,
      supportedArtistId: null,
      supportedArtistName: '',
      agreedToTerms: false,
      agreedToArtistTerms: false,
      address: '',
      detectingLocation: false,
      dateOfBirth: null,
      gender: null,
      themePreference: 'blue',
      songIsrc: '',
    });
    setValidation({
      referralCode: { checking: false, valid: null, message: '' },
      username: { checking: false, valid: null, message: '' },
      email: { checking: false, valid: null, message: '' },
      password: { checking: false, valid: null, message: '' },
      passwordConfirm: { checking: false, valid: null, message: '' },
    });
    setError('');
    setSuccess(false);
    setPartialSuccess(false);
    setVerificationEmail('');
    setSubmitPhase(null);
    onClose();
  };

  // ============================================================================
  // RENDER STEP CONTENT
  // ============================================================================
  const renderStepContent = () => {
    switch (currentStepData?.id) {
      // ========== WELCOME STEP ==========
      case 'welcome':
        return (
          <View>
            <View style={styles.stepHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={styles.stepTitle}>Welcome to </Text>
            <View style={{ marginTop: 12, paddingTop: 11, }}>
              <UnisLogo width={80} height={82} />
            </View>
            </View>             
            <Text style={styles.stepSubtitle}>Enter your referral code to join the community.</Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Referral Code</Text>
              <View style={styles.inputWrapper}>
                <Gift size={20} color={COLORS.textGray} style={styles.inputIcon} />
                <TextInput
                  style={[
                    styles.input,
                    styles.inputWithIcon,
                    validation.referralCode.valid === true && styles.inputSuccess,
                    validation.referralCode.valid === false && styles.inputError,
                  ]}
                  placeholder="e.g. UNIS-LAUNCH-2024"
                  placeholderTextColor={COLORS.textGray}
                  value={formData.referralCode}
                  onChangeText={(text) => {
                    const value = text.toUpperCase();
                    updateForm('referralCode', value);
                    validateReferralCode(value);
                  }}
                  autoCapitalize="characters"
                />
                {validation.referralCode.checking && (
                  <ActivityIndicator size="small" color={COLORS.textGray} style={styles.validationIcon} />
                )}
                {validation.referralCode.valid === true && (
                  <CheckCircle2 size={20} color={COLORS.successGreen} style={styles.validationIcon} />
                )}
                {validation.referralCode.valid === false && (
                  <XCircle size={20} color={COLORS.errorRed} style={styles.validationIcon} />
                )}
              </View>
              {validation.referralCode.message ? (
                <Text
                  style={[
                    styles.helperText,
                    validation.referralCode.valid ? styles.successText : styles.errorText,
                  ]}
                >
                  {validation.referralCode.message}
                </Text>
              ) : null}
            </View>

            <View style={[styles.alertBox, styles.alertInfo]}>
              <Info size={20} color={COLORS.unisBlueBright} />
              <View style={styles.alertContent}>
                <Text style={styles.alertTitle}>Don't have a code?</Text>
                <Text style={styles.alertMessage}>
                  During launch, use <Text style={styles.bold}>UNIS-LAUNCH-2024</Text>
                </Text>
              </View>
            </View>
          </View>
        );

      // ========== BASIC INFO STEP ==========
      case 'basicInfo':
        return (
          <View>
            <View style={styles.stepHeader}>
              <Text style={styles.stepTitle}>Create Your Account</Text>
              <Text style={styles.stepSubtitle}>Set up your Unis identity.</Text>
            </View>

            {/* Username */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Username</Text>
              <View style={styles.inputWrapper}>
                <User size={20} color={COLORS.textGray} style={styles.inputIcon} />
                <TextInput
                  style={[
                    styles.input,
                    styles.inputWithIcon,
                    validation.username.valid === true && styles.inputSuccess,
                    validation.username.valid === false && styles.inputError,
                  ]}
                  placeholder="Your unique username"
                  placeholderTextColor={COLORS.textGray}
                  value={formData.username}
                  onChangeText={(text) => {
                    const value = text.toLowerCase().replace(/[^a-z0-9_]/g, '');
                    updateForm('username', value);
                    validateUsername(value);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {validation.username.checking && (
                  <ActivityIndicator size="small" color={COLORS.textGray} style={styles.validationIcon} />
                )}
                {validation.username.valid === true && (
                  <CheckCircle2 size={20} color={COLORS.successGreen} style={styles.validationIcon} />
                )}
                {validation.username.valid === false && (
                  <XCircle size={20} color={COLORS.errorRed} style={styles.validationIcon} />
                )}
              </View>
              {validation.username.message ? (
                <Text style={styles.helperText}>{validation.username.message}</Text>
              ) : null}
            </View>

            {/* Email */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrapper}>
                <Mail size={20} color={COLORS.textGray} style={styles.inputIcon} />
                <TextInput
                  style={[
                    styles.input,
                    styles.inputWithIcon,
                    validation.email.valid === true && styles.inputSuccess,
                    validation.email.valid === false && styles.inputError,
                  ]}
                  placeholder="your@email.com"
                  placeholderTextColor={COLORS.textGray}
                  value={formData.email}
                  onChangeText={(text) => {
                    updateForm('email', text);
                    validateEmail(text);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {validation.email.checking && (
                  <ActivityIndicator size="small" color={COLORS.textGray} style={styles.validationIcon} />
                )}
                {validation.email.valid === true && (
                  <CheckCircle2 size={20} color={COLORS.successGreen} style={styles.validationIcon} />
                )}
                {validation.email.valid === false && (
                  <XCircle size={20} color={COLORS.errorRed} style={styles.validationIcon} />
                )}
              </View>
              {validation.email.message ? (
                <Text style={[styles.helperText, styles.errorText]}>{validation.email.message}</Text>
              ) : null}
            </View>

            {/* Password */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrapper}>
                <Lock size={20} color={COLORS.textGray} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.inputWithIcon]}
                  placeholder="At least 8 characters"
                  placeholderTextColor={COLORS.textGray}
                  value={formData.password}
                  onChangeText={(text) => {
                    updateForm('password', text);
                    validatePassword(text);
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>
              {validation.password.message ? (
                <Text style={styles.helperText}>{validation.password.message}</Text>
              ) : null}
            </View>

            {/* Confirm Password */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.inputWrapper}>
                <Lock size={20} color={COLORS.textGray} style={styles.inputIcon} />
                <TextInput
                  style={[
                    styles.input,
                    styles.inputWithIcon,
                    validation.passwordConfirm.valid === true && styles.inputSuccess,
                    validation.passwordConfirm.valid === false && styles.inputError,
                  ]}
                  placeholder="Re-enter password"
                  placeholderTextColor={COLORS.textGray}
                  value={formData.passwordConfirm}
                  onChangeText={(text) => {
                    updateForm('passwordConfirm', text);
                    validatePasswordConfirm(text);
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                />
                {validation.passwordConfirm.valid === true && (
                  <CheckCircle2 size={20} color={COLORS.successGreen} style={styles.validationIcon} />
                )}
                {validation.passwordConfirm.valid === false && (
                  <XCircle size={20} color={COLORS.errorRed} style={styles.validationIcon} />
                )}
              </View>
              {validation.passwordConfirm.message ? (
                <Text
                  style={[
                    styles.helperText,
                    validation.passwordConfirm.valid ? styles.successText : styles.errorText,
                  ]}
                >
                  {validation.passwordConfirm.message}
                </Text>
              ) : null}
            </View>

            {/* Date of Birth — required, age >= 13 (parity with web) */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Date of Birth</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[
                    styles.input,
                    computeAge(formData.dateOfBirth) === null
                      ? undefined
                      : (computeAge(formData.dateOfBirth) as number) >= 13
                      ? styles.inputSuccess
                      : styles.inputError,
                  ]}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={COLORS.textGray}
                  value={formData.dateOfBirth ?? ''}
                  onChangeText={(text) => updateForm('dateOfBirth', maskDob(text))}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </View>
              {(() => {
                const age = computeAge(formData.dateOfBirth);
                if (age !== null && age < 13) {
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <AlertCircle size={14} color={COLORS.errorRed} />
                      <Text style={[styles.helperText, styles.errorText]}>
                        You must be at least 13 years old to join Unis.
                      </Text>
                    </View>
                  );
                }
                if (age !== null && age >= 13 && age < 18) {
                  return (
                    <Text style={[styles.helperText, { color: COLORS.warningAmber }]}>
                      Under 18: Explicit content will be disabled on your account.
                    </Text>
                  );
                }
                return null;
              })()}
              <Text style={styles.helperText}>
                Your date of birth is private and never shown publicly. Used for age verification only.
              </Text>
            </View>

            {/* Gender (optional) — feeds the artist demographics filter */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Gender (optional)</Text>
              <View style={[styles.genreChips, { flexWrap: 'wrap' }]}>
                {[
                  { value: '', label: 'Prefer not to say' },
                  { value: 'male', label: 'Male' },
                  { value: 'female', label: 'Female' },
                  { value: 'non-binary', label: 'Non-binary' },
                ].map((opt) => {
                  const selected = (formData.gender ?? '') === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value || 'none'}
                      style={[styles.genreChip, selected && styles.genreChipSelected]}
                      onPress={() => updateForm('gender', opt.value || null)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={opt.label}
                    >
                      <Text
                        style={[styles.genreChipText, selected && styles.genreChipTextSelected]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        );

      // ========== LOCATION STEP ==========
      case 'location':
        return (
          <View>
            <View style={styles.stepHeader}>
              <Text style={styles.stepTitle}>Where Are You From?</Text>
              <Text style={styles.stepSubtitle}>
                Enter your address to find your jurisdiction. This is permanent!
              </Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Your Address</Text>
              <View style={styles.inputWrapper}>
                <MapPin size={20} color={COLORS.textGray} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.inputWithIcon]}
                  placeholder="123 W 125th St, New York, NY"
                  placeholderTextColor={COLORS.textGray}
                  value={formData.address}
                  onChangeText={(text) => updateForm('address', text)}
                />
              </View>
              <Text style={styles.helperText}>Enter your street address in Harlem</Text>
            </View>

            <TouchableOpacity
              style={[styles.secondaryButton, !formData.address && styles.buttonDisabled]}
              onPress={detectLocation}
              disabled={!formData.address || formData.detectingLocation}
            >
              {formData.detectingLocation ? (
                <ActivityIndicator size="small" color={COLORS.accentWhite} />
              ) : (
                <MapPin size={20} color={COLORS.accentWhite} />
              )}
              <Text style={styles.secondaryButtonText}>
                {formData.detectingLocation ? 'Detecting...' : 'Find My Jurisdiction'}
              </Text>
            </TouchableOpacity>

            {formData.jurisdictionId ? (
              <View style={[styles.alertBox, styles.alertSuccess]}>
                <CheckCircle2 size={20} color={COLORS.successGreen} />
                <View style={styles.alertContent}>
                  <Text style={[styles.alertTitle, { color: COLORS.successGreen }]}>
                    Found: {formData.jurisdictionName}
                  </Text>
                  <Text style={[styles.alertMessage, { color: 'rgba(34, 197, 94, 0.8)' }]}>
                    You'll represent this jurisdiction in all competitions. This cannot be changed!
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={[styles.formGroup, { marginTop: 20 }]}>
              <Text style={styles.label}>Or Select Manually</Text>
              <View style={styles.selectContainer}>
                <TouchableOpacity
                  style={[
                    styles.selectOption,
                    formData.jurisdictionId === JURISDICTION_IDS['uptown-harlem'] &&
                      styles.selectOptionSelected,
                  ]}
                  onPress={() => {
                    updateForm('jurisdictionId', JURISDICTION_IDS['uptown-harlem']);
                    updateForm('jurisdictionName', 'Uptown Harlem');
                  }}
                >
                  <Text
                    style={[
                      styles.selectOptionText,
                      formData.jurisdictionId === JURISDICTION_IDS['uptown-harlem'] &&
                        styles.selectOptionTextSelected,
                    ]}
                  >
                    Uptown Harlem
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.selectOption,
                    formData.jurisdictionId === JURISDICTION_IDS['downtown-harlem'] &&
                      styles.selectOptionSelected,
                  ]}
                  onPress={() => {
                    updateForm('jurisdictionId', JURISDICTION_IDS['downtown-harlem']);
                    updateForm('jurisdictionName', 'Downtown Harlem');
                  }}
                >
                  <Text
                    style={[
                      styles.selectOptionText,
                      formData.jurisdictionId === JURISDICTION_IDS['downtown-harlem'] &&
                        styles.selectOptionTextSelected,
                    ]}
                  >
                    Downtown Harlem
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );

      // ========== ROLE SELECTION STEP ==========
      case 'role':
        return (
          <View>
            <View style={styles.stepHeader}>
              <Text style={styles.stepTitle}>How Will You Use Unis?</Text>
              <Text style={styles.stepSubtitle}>Choose your path. You can upgrade later.</Text>
            </View>

            <View style={styles.roleSelection}>
              <TouchableOpacity
                style={[styles.roleCard, formData.role === 'listener' && styles.roleCardSelected]}
                onPress={() => updateForm('role', 'listener')}
              >
                {formData.role === 'listener' && (
                  <View style={styles.roleCheckmark}>
                    <Check size={14} color={COLORS.accentWhite} />
                  </View>
                )}
                <Headphones size={48} color={COLORS.unisBlue} style={styles.roleIcon} />
                <Text style={styles.roleTitle}>Listener</Text>
                <Text style={styles.roleDescription}>
                  Discover music, vote daily, earn from referrals
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.roleCard, formData.role === 'artist' && styles.roleCardSelected]}
                onPress={() => updateForm('role', 'artist')}
              >
                {formData.role === 'artist' && (
                  <View style={styles.roleCheckmark}>
                    <Check size={14} color={COLORS.accentWhite} />
                  </View>
                )}
                <Mic2 size={48} color={COLORS.gradientTeal} style={styles.roleIcon} />
                <Text style={styles.roleTitle}>Artist</Text>
                <Text style={styles.roleDescription}>
                  Upload music, compete for awards, earn 50% revenue
                </Text>
              </TouchableOpacity>
            </View>

            {formData.role ? (
              <View style={[styles.alertBox, styles.alertSuccess]}>
                <Sparkles size={20} color={COLORS.successGreen} />
                <View style={styles.alertContent}>
                  <Text style={[styles.alertTitle, { color: COLORS.successGreen }]}>
                    {formData.role === 'artist' ? "Let's Make History" : "Let's Discover Music"}
                  </Text>
                  <Text style={[styles.alertMessage, { color: 'rgba(34, 197, 94, 0.8)' }]}>
                    {formData.role === 'artist'
                      ? 'Upload your music and compete in awards!'
                      : 'Discover local talent and shape who gets recognized!'}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Theme preference — stored on the account; honored by the web app */}
            <View style={[styles.formGroup, { marginTop: 20 }]}>
              <Text style={styles.label}>Pick your theme</Text>
              <View style={styles.themeSwatches}>
                {THEME_SWATCHES.map((t) => {
                  const selected = formData.themePreference === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[
                        styles.themeSwatch,
                        { backgroundColor: t.color },
                        selected && styles.themeSwatchSelected,
                      ]}
                      onPress={() => updateForm('themePreference', t.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${t.label} theme`}
                    >
                      {selected && <Check size={16} color={COLORS.accentWhite} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        );

      // ========== ARTIST PROFILE STEP ==========
      case 'artistProfile':
        return (
          <View>
            <View style={styles.stepHeader}>
              <Text style={styles.stepTitle}>Your Artist Profile</Text>
              <Text style={styles.stepSubtitle}>Set up your artist identity.</Text>
            </View>

            {/* Profile Photo Upload */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Profile Photo</Text>
              <TouchableOpacity
                style={[styles.uploadZone, formData.artistPhotoUri && styles.uploadZoneHasFile]}
                onPress={() => pickImage('artist')}
              >
                {formData.artistPhotoUri ? (
                  <View style={styles.filePreview}>
                    <Image
                      source={{ uri: formData.artistPhotoUri }}
                      style={styles.previewImageRound}
                    />
                    <Text style={styles.fileName}>Photo selected</Text>
                    <TouchableOpacity
                      style={styles.removeFileButton}
                      onPress={() => updateForm('artistPhotoUri', null)}
                    >
                      <X size={16} color={COLORS.errorRed} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <ImageIcon size={48} color={COLORS.textGray} />
                    <Text style={styles.uploadText}>
                      <Text style={styles.uploadTextBold}>Tap to upload</Text>
                    </Text>
                    <Text style={styles.uploadHint}>PNG, JPG up to 5MB</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Genre Selection */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Primary Genre</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.genreChips}>
                  {Object.entries(GENRE_IDS).map(([key, id]) => (
                    <TouchableOpacity
                      key={id}
                      style={[styles.genreChip, formData.genreId === id && styles.genreChipSelected]}
                      onPress={() => updateForm('genreId', id)}
                    >
                      <Text
                        style={[
                          styles.genreChipText,
                          formData.genreId === id && styles.genreChipTextSelected,
                        ]}
                      >
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Bio */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Bio (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Tell fans about yourself..."
                placeholderTextColor={COLORS.textGray}
                value={formData.bio}
                onChangeText={(text) => updateForm('bio', text)}
                multiline
                maxLength={500}
              />
              <Text style={styles.helperText}>{formData.bio.length}/500</Text>
            </View>
          </View>
        );

      // ========== SONG UPLOAD STEP ==========
      case 'songUpload':
        return (
          <View>
            <View style={styles.stepHeader}>
              <Text style={styles.stepTitle}>Your Debut Track</Text>
              <Text style={styles.stepSubtitle}>Upload your first song to Unis.</Text>
            </View>

            {/* Song Title */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Song Title</Text>
              <View style={styles.inputWrapper}>
                <Music size={20} color={COLORS.textGray} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.inputWithIcon]}
                  placeholder="Track name"
                  placeholderTextColor={COLORS.textGray}
                  value={formData.songTitle}
                  onChangeText={(text) => updateForm('songTitle', text)}
                />
              </View>
            </View>

            {/* ISRC (Optional) */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>ISRC (Optional)</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. US-ABC-24-00001"
                  placeholderTextColor={COLORS.textGray}
                  value={formData.songIsrc}
                  onChangeText={(text) => updateForm('songIsrc', text.toUpperCase())}
                  autoCapitalize="characters"
                />
              </View>
              <Text style={styles.helperText}>
                Your International Standard Recording Code, if you have one.
              </Text>
            </View>

            {/* Audio File Upload */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Audio File</Text>
              <TouchableOpacity
                style={[styles.uploadZone, formData.songFileUri && styles.uploadZoneHasFile]}
                onPress={pickAudioFile}
              >
                {formData.songFileUri ? (
                  <View style={styles.filePreview}>
                    <FileAudio size={40} color={COLORS.successGreen} />
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName}>{formData.songFileName}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.removeFileButton}
                      onPress={() => {
                        updateForm('songFileUri', null);
                        updateForm('songFileName', '');
                      }}
                    >
                      <X size={16} color={COLORS.errorRed} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <FileAudio size={48} color={COLORS.textGray} />
                    <Text style={styles.uploadText}>
                      <Text style={styles.uploadTextBold}>Tap to upload</Text>
                    </Text>
                    <Text style={styles.uploadHint}>MP3, WAV, FLAC up to 50MB</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Song Artwork Upload */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Song Artwork</Text>
              <TouchableOpacity
                style={[styles.uploadZone, formData.songArtworkUri && styles.uploadZoneHasFile]}
                onPress={() => pickImage('artwork')}
              >
                {formData.songArtworkUri ? (
                  <View style={styles.filePreview}>
                    <Image
                      source={{ uri: formData.songArtworkUri }}
                      style={styles.previewImageSquare}
                    />
                    <Text style={styles.fileName}>Artwork selected</Text>
                    <TouchableOpacity
                      style={styles.removeFileButton}
                      onPress={() => updateForm('songArtworkUri', null)}
                    >
                      <X size={16} color={COLORS.errorRed} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <ImageIcon size={48} color={COLORS.textGray} />
                    <Text style={styles.uploadText}>
                      <Text style={styles.uploadTextBold}>Tap to upload</Text> cover art
                    </Text>
                    <Text style={styles.uploadHint}>Square, at least 500x500px</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        );

      // ========== LISTENER PROFILE STEP ==========
      case 'listenerProfile':
        return (
          <View>
            <View style={styles.stepHeader}>
              <Text style={styles.stepTitle}>Show Your Face</Text>
              <Text style={styles.stepSubtitle}>Let the community know who you are.</Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Profile Photo</Text>
              <TouchableOpacity
                style={[styles.uploadZone, formData.listenerPhotoUri && styles.uploadZoneHasFile]}
                onPress={() => pickImage('listener')}
              >
                {formData.listenerPhotoUri ? (
                  <View style={styles.filePreview}>
                    <Image
                      source={{ uri: formData.listenerPhotoUri }}
                      style={styles.previewImageRound}
                    />
                    <Text style={styles.fileName}>Photo selected</Text>
                    <TouchableOpacity
                      style={styles.removeFileButton}
                      onPress={() => updateForm('listenerPhotoUri', null)}
                    >
                      <X size={16} color={COLORS.errorRed} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <ImageIcon size={48} color={COLORS.textGray} />
                    <Text style={styles.uploadText}>
                      <Text style={styles.uploadTextBold}>Tap to upload</Text> your photo
                    </Text>
                    <Text style={styles.uploadHint}>PNG, JPG up to 5MB</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={[styles.alertBox, styles.alertInfo]}>
              <Sparkles size={20} color={COLORS.unisBlueBright} />
              <View style={styles.alertContent}>
                <Text style={styles.alertTitle}>Make it memorable!</Text>
                <Text style={styles.alertMessage}>
                  Your profile photo helps artists and other listeners recognize you in the community.
                </Text>
              </View>
            </View>
          </View>
        );

      // ========== LISTENER BIO STEP ==========
      case 'listenerBio':
        return (
          <View>
            <View style={styles.stepHeader}>
              <Text style={styles.stepTitle}>Tell Your Story</Text>
              <Text style={styles.stepSubtitle}>What brings you to Unis? What music moves you?</Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Your Bio</Text>
              <TextInput
                style={[styles.input, styles.textArea, { minHeight: 150 }]}
                placeholder="I'm a Harlem native who loves discovering new talent. Hip-hop runs through my veins, but I'm always open to vibes..."
                placeholderTextColor={COLORS.textGray}
                value={formData.bio}
                onChangeText={(text) => updateForm('bio', text)}
                multiline
                maxLength={500}
              />
              <Text style={styles.helperText}>
                {formData.bio.length}/500 characters
                {formData.bio.length < 10 && ' (minimum 10)'}
              </Text>
            </View>

            <View style={[styles.alertBox, styles.alertSuccess]}>
              <Heart size={20} color={COLORS.successGreen} />
              <View style={styles.alertContent}>
                <Text style={[styles.alertTitle, { color: COLORS.successGreen }]}>Be authentic!</Text>
                <Text style={[styles.alertMessage, { color: 'rgba(34, 197, 94, 0.8)' }]}>
                  Share your music taste, favorite artists, or what you're looking for. This helps
                  build connections.
                </Text>
              </View>
            </View>
          </View>
        );

      // ========== SUPPORT ARTIST STEP ==========
      case 'supportArtist':
        return (
          <View>
            <View style={styles.stepHeader}>
              <Text style={styles.stepTitle}>Support an Artist</Text>
              <Text style={styles.stepSubtitle}>
                They'll receive 15% of ad revenue from your activity.
              </Text>
            </View>

            {/* Search */}
            <View style={styles.formGroup}>
              <View style={styles.inputWrapper}>
                <Search size={20} color={COLORS.textGray} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.inputWithIcon]}
                  placeholder="Search artists..."
                  placeholderTextColor={COLORS.textGray}
                  value={artistSearch}
                  onChangeText={setArtistSearch}
                />
              </View>
            </View>

            {/* Filters */}
            <View style={styles.filterChips}>
              <TouchableOpacity
                style={[styles.filterChip, artistFilter === 'all' && styles.filterChipActive]}
                onPress={() => setArtistFilter('all')}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    artistFilter === 'all' && styles.filterChipTextActive,
                  ]}
                >
                  All
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  artistFilter === JURISDICTION_IDS['uptown-harlem'] && styles.filterChipActive,
                ]}
                onPress={() => setArtistFilter(JURISDICTION_IDS['uptown-harlem'])}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    artistFilter === JURISDICTION_IDS['uptown-harlem'] && styles.filterChipTextActive,
                  ]}
                >
                  Uptown
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  artistFilter === JURISDICTION_IDS['downtown-harlem'] && styles.filterChipActive,
                ]}
                onPress={() => setArtistFilter(JURISDICTION_IDS['downtown-harlem'])}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    artistFilter === JURISDICTION_IDS['downtown-harlem'] && styles.filterChipTextActive,
                  ]}
                >
                  Downtown
                </Text>
              </TouchableOpacity>
            </View>

            {/* Artists List */}
            {artistsLoading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator size="large" color={COLORS.unisBlue} />
                <Text style={styles.emptyStateText}>Loading artists...</Text>
              </View>
            ) : filteredArtists.length === 0 ? (
              <View style={styles.emptyState}>
                <Users size={48} color={COLORS.textGray} />
                <Text style={styles.emptyStateText}>No artists found</Text>
              </View>
            ) : (
              <View style={styles.artistsGrid}>
                {filteredArtists.map((artist) => (
                  <TouchableOpacity
                    key={artist.userId}
                    style={[
                      styles.artistCard,
                      formData.supportedArtistId === artist.userId && styles.artistCardSelected,
                      playingArtistId === artist.userId && styles.artistCardPlaying,
                    ]}
                    onPress={() => {
                      updateForm('supportedArtistId', artist.userId);
                      updateForm('supportedArtistName', artist.username);
                    }}
                  >
                    {buildUrl(artist.photoUrl) ? (
                      <Image
                          source={{ uri: buildUrl(artist.photoUrl) as string }}
                          style={styles.artistPhoto}
                      />
                    ) : (
                      <View style={styles.artistPhotoPlaceholder}>
                        <Text style={styles.artistPhotoInitial}>
                          {artist.username?.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}

                    <View style={styles.artistInfo}>
                      <Text style={styles.artistName}>{artist.username}</Text>
                      {artist.jurisdiction?.name && (
                        <View style={styles.jurisdictionBadge}>
                          <Text style={styles.jurisdictionBadgeText}>{artist.jurisdiction.name}</Text>
                        </View>
                      )}
                      {artist.defaultSong?.title && (
                        <Text style={styles.artistSongTitle}>♪ {artist.defaultSong.title}</Text>
                      )}
                    </View>

                    <TouchableOpacity
                      style={styles.artistPlayButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        playArtistPreview(artist);
                      }}
                      disabled={!artist.defaultSongId}
                    >
                      {playingArtistId === artist.userId ? (
                        <Pause size={20} color={COLORS.accentWhite} />
                      ) : (
                        <Play size={20} color={COLORS.accentWhite} />
                      )}
                    </TouchableOpacity>

                    <View
                      style={[
                        styles.selectIndicator,
                        formData.supportedArtistId === artist.userId && styles.selectIndicatorChecked,
                      ]}
                    >
                      {formData.supportedArtistId === artist.userId && (
                        <Check size={14} color={COLORS.accentWhite} />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        );

      // ========== REVIEW STEP ==========
      case 'review':
        if (success || partialSuccess) {
          return (
            <View style={styles.successAnimation}>
              <View
                style={[
                  styles.checkmarkCircle,
                  partialSuccess && { backgroundColor: COLORS.warningAmber },
                ]}
              >
                <Check size={40} color={COLORS.accentWhite} />
              </View>
              <Text style={styles.successTitle}>
                {partialSuccess ? 'Account created' : 'Check your email'}
              </Text>
              {partialSuccess ? (
                <Text style={styles.successSubtitle}>{error}</Text>
              ) : (
                <Text style={styles.successSubtitle}>
                  We sent a verification link to{' '}
                  <Text style={{ color: COLORS.accentWhite }}>{verificationEmail}</Text>. Verify
                  your email, then sign in to start using Unis.
                </Text>
              )}
              <TouchableOpacity
                style={[styles.primaryNavButton, { marginTop: 24, alignSelf: 'stretch' }]}
                onPress={onSuccess}
                accessibilityRole="button"
                accessibilityLabel="Continue to sign in"
              >
                <Text style={styles.primaryNavButtonText}>Go to Sign In</Text>
              </TouchableOpacity>
            </View>
          );
        }

        return (
          <View>
            <View style={styles.stepHeader}>
              <Text style={styles.stepTitle}>Review & Confirm</Text>
              <Text style={styles.stepSubtitle}>Accept the terms to create your account.</Text>
            </View>

            {/* Account Details Review */}
            <View style={styles.reviewCard}>
              <Text style={styles.reviewCardTitle}>Account Details</Text>
              <View style={styles.reviewItem}>
                <Text style={styles.reviewItemLabel}>Username</Text>
                <Text style={styles.reviewItemValue}>@{formData.username}</Text>
              </View>
              <View style={styles.reviewItem}>
                <Text style={styles.reviewItemLabel}>Email</Text>
                <Text style={styles.reviewItemValue}>{formData.email}</Text>
              </View>
              <View style={styles.reviewItem}>
                <Text style={styles.reviewItemLabel}>Type</Text>
                <Text style={[styles.reviewItemValue, { textTransform: 'capitalize' }]}>
                  {formData.role}
                </Text>
              </View>
              <View style={styles.reviewItem}>
                <Text style={styles.reviewItemLabel}>Jurisdiction</Text>
                <Text style={styles.reviewItemValue}>{formData.jurisdictionName}</Text>
              </View>
            </View>

            {/* Artist Details (if artist) */}
            {formData.role === 'artist' && (
              <View style={styles.reviewCard}>
                <Text style={styles.reviewCardTitle}>Artist Details</Text>
                <View style={styles.reviewItem}>
                  <Text style={styles.reviewItemLabel}>Debut Song</Text>
                  <Text style={styles.reviewItemValue}>{formData.songTitle}</Text>
                </View>
                <View style={styles.reviewItem}>
                  <Text style={styles.reviewItemLabel}>Genre</Text>
                  <Text style={styles.reviewItemValue}>
                    {Object.entries(GENRE_IDS).find(([k, v]) => v === formData.genreId)?.[0] || ''}
                  </Text>
                </View>
              </View>
            )}

            {/* Supporting Artist */}
            <View style={styles.reviewCard}>
              <Text style={styles.reviewCardTitle}>Supporting</Text>
              <View style={styles.reviewItem}>
                <Text style={styles.reviewItemLabel}>Artist</Text>
                <View style={styles.reviewItemValueWithIcon}>
                  <Music size={16} color={COLORS.successGreen} />
                  <Text style={styles.reviewItemValue}>{formData.supportedArtistName}</Text>
                </View>
              </View>
            </View>

            {/* Terms of Service */}
            <View style={styles.agreementSection}>
              <Text style={styles.agreementTitle}>Terms of Service</Text>
              <Text style={styles.agreementItem}>1. You must be at least 13 years old.</Text>
              <Text style={styles.agreementItem}>2. One account per person.</Text>
              <Text style={styles.agreementItem}>3. No hate speech or copyrighted content.</Text>
              <Text style={styles.agreementItem}>4. Your jurisdiction is permanent.</Text>
            </View>

            <TouchableOpacity
              style={styles.checkboxGroup}
              onPress={() => updateForm('agreedToTerms', !formData.agreedToTerms)}
            >
              <View
                style={[styles.checkbox, formData.agreedToTerms && styles.checkboxChecked]}
              >
                {formData.agreedToTerms && <Check size={14} color={COLORS.accentWhite} />}
              </View>
              <Text style={styles.checkboxLabel}>
                I agree to the Terms of Service and Privacy Policy
              </Text>
            </TouchableOpacity>

            {/* Artist Upload Agreement (if artist) */}
            {formData.role === 'artist' && (
              <>
                <View style={[styles.agreementSection, { marginTop: 16 }]}>
                  <Text style={styles.agreementTitle}>Artist Upload Agreement</Text>
                  <Text style={styles.agreementItem}>
                    1. You own 100% of master and publishing rights.
                  </Text>
                  <Text style={styles.agreementItem}>
                    2. You grant Unis a non-exclusive license.
                  </Text>
                  <Text style={styles.agreementItem}>
                    3. You'll receive 50% of net ad revenue.
                  </Text>
                  <Text style={styles.agreementItem}>4. Terminable with 30 days notice.</Text>
                </View>

                <TouchableOpacity
                  style={styles.checkboxGroup}
                  onPress={() => updateForm('agreedToArtistTerms', !formData.agreedToArtistTerms)}
                >
                  <View
                    style={[
                      styles.checkbox,
                      formData.agreedToArtistTerms && styles.checkboxChecked,
                    ]}
                  >
                    {formData.agreedToArtistTerms && <Check size={14} color={COLORS.accentWhite} />}
                  </View>
                  <Text style={styles.checkboxLabel}>I agree to the Artist Upload Agreement</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        );

      default:
        return null;
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <View style={styles.container}>
            {/* Close Button */}
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <X size={24} color={COLORS.textSilver} />
            </TouchableOpacity>

            {/* Gradient Header */}
            <LinearGradient
              colors={[COLORS.unisBlue, COLORS.unisBlueBright, COLORS.gradientTeal]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.illustrationHeader}
            >
              <Text style={styles.stepIndicatorText}>
                Step {currentStep} of {totalSteps}
              </Text>
              <Text style={styles.stepName}>{currentStepData?.title}</Text>
            </LinearGradient>

            {/* Progress Bar */}
            <View style={styles.progressBar}>
              {steps.map((step, index) => {
                const isActive = index + 1 === currentStep;
                const isCompleted = index + 1 < currentStep;

                if (isActive) {
                  return (
                    <Animated.View
                      key={step.id}
                      style={[
                        styles.progressStep,
                        styles.progressStepActive,
                        { opacity: blinkAnim },
                      ]}
                    />
                  );
                }

                return (
                  <View
                    key={step.id}
                    style={[
                      styles.progressStep,
                      isCompleted && styles.progressStepCompleted,
                    ]}
                  />
                );
              })}
            </View>
            {/* Content */}
            <ScrollView
              ref={scrollViewRef}
              style={styles.content}
              contentContainerStyle={styles.contentContainer}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Error Alert — hidden on the success/partial-success screen (message shown there) */}
              {error && !success && !partialSuccess ? (
                <View style={[styles.alertBox, styles.alertError]}>
                  <AlertCircle size={20} color={COLORS.errorRed} />
                  <View style={styles.alertContent}>
                    <Text style={[styles.alertTitle, { color: COLORS.errorRed }]}>Oops!</Text>
                    <Text style={[styles.alertMessage, { color: 'rgba(239, 68, 68, 0.8)' }]}>
                      {error}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Step Content */}
              {renderStepContent()}

              {/* Bottom spacing */}
              <View style={{ height: 100 }} />
            </ScrollView>

            {/* Navigation Buttons */}
            {!success && !partialSuccess && (
              <View style={styles.navigation}>
                {currentStep > 1 && (
                  <TouchableOpacity style={styles.secondaryNavButton} onPress={goBack}>
                    <ChevronLeft size={20} color={COLORS.textSilver} />
                    <Text style={styles.secondaryNavButtonText}>Back</Text>
                  </TouchableOpacity>
                )}

                {currentStep < totalSteps ? (
                  <TouchableOpacity
                    style={[
                      styles.primaryNavButton,
                      !canProceed() && styles.buttonDisabled,
                      currentStep === 1 && { flex: 1 },
                    ]}
                    onPress={goNext}
                    disabled={!canProceed()}
                  >
                    <Text style={styles.primaryNavButtonText}>Continue</Text>
                    <ChevronRight size={20} color={COLORS.accentWhite} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.primaryNavButton,
                      (!canProceed() || loading) && styles.buttonDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={!canProceed() || loading}
                  >
                    {loading ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <ActivityIndicator size="small" color={COLORS.accentWhite} />
                        <Text style={styles.primaryNavButtonText}>
                          {submitPhase === 'uploading-photo'
                            ? 'Uploading photo…'
                            : submitPhase === 'uploading-song'
                            ? 'Uploading song…'
                            : 'Creating account…'}
                        </Text>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.primaryNavButtonText}>Create Account</Text>
                        <Sparkles size={20} color={COLORS.accentWhite} />
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

// ============================================================================
// STYLES
// ============================================================================
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  keyboardView: {
    flex: 1,
  },
  container: {
    backgroundColor: COLORS.bgDark,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    flex: 1,
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },

  // Header
  illustrationHeader: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 20,
  },
  stepIndicatorText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 4,
  },
  stepName: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.accentWhite,
  },

  // Progress Bar
  progressBar: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 8,
  },
  progressStep: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
  },
  progressStepCompleted: {
    backgroundColor: COLORS.successGreen,
  },
  progressStepActive: {
    backgroundColor: COLORS.unisBlue,
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
  },

  // Step Header
  stepHeader: {
    marginBottom: 24,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.accentWhite,
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 15,
    color: COLORS.textGray,
    lineHeight: 22,
  },

  // Form Elements
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSilver,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputWrapper: {
    position: 'relative',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: COLORS.borderSubtle,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: COLORS.accentWhite,
  },
  inputWithIcon: {
    paddingLeft: 48,
  },
  inputIcon: {
    position: 'absolute',
    left: 16,
    top: 18,
    zIndex: 1,
  },
  validationIcon: {
    position: 'absolute',
    right: 16,
    top: 18,
  },
  inputSuccess: {
    borderColor: COLORS.successGreen,
  },
  inputError: {
    borderColor: COLORS.errorRed,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  helperText: {
    fontSize: 13,
    color: COLORS.textGray,
    marginTop: 8,
  },
  successText: {
    color: COLORS.successGreen,
  },
  errorText: {
    color: COLORS.errorRed,
  },
  bold: {
    fontWeight: '700',
  },

  // Buttons
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.accentWhite,
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  // Alert Boxes
  alertBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  alertInfo: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  alertSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  alertError: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.unisBlueBright,
    marginBottom: 4,
  },
  alertMessage: {
    fontSize: 13,
    color: 'rgba(59, 130, 246, 0.8)',
    lineHeight: 18,
  },

  // Select Options
  selectContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  selectOption: {
    flex: 1,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 12,
    alignItems: 'center',
  },
  selectOptionSelected: {
    borderColor: COLORS.unisBlue,
    backgroundColor: 'rgba(22, 51, 135, 0.2)',
  },
  selectOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSilver,
  },
  selectOptionTextSelected: {
    color: COLORS.accentWhite,
  },

  // Role Selection
  roleSelection: {
    flexDirection: 'column',
    gap: 16,
    marginTop: 16,
  },
  roleCard: {
    position: 'relative',
    padding: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    alignItems: 'center',
  },
  roleCardSelected: {
    borderColor: COLORS.unisBlue,
    backgroundColor: 'rgba(22, 51, 135, 0.1)',
  },
  roleCheckmark: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.successGreen,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleIcon: {
    marginBottom: 16,
  },
  roleTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.accentWhite,
    marginBottom: 8,
  },
  roleDescription: {
    fontSize: 13,
    color: COLORS.textGray,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Upload Zone
  uploadZone: {
    padding: 32,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  uploadZoneHasFile: {
    borderStyle: 'solid',
    borderColor: COLORS.successGreen,
    backgroundColor: 'rgba(34, 197, 94, 0.05)',
  },
  uploadText: {
    fontSize: 15,
    color: COLORS.textSilver,
    marginTop: 16,
    marginBottom: 8,
  },
  uploadTextBold: {
    fontWeight: '700',
    color: COLORS.unisBlue,
  },
  uploadHint: {
    fontSize: 13,
    color: COLORS.textGray,
  },
  filePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  previewImageRound: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  previewImageSquare: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.accentWhite,
    flex: 1,
  },
  removeFileButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Genre Chips
  genreChips: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 4,
  },
  genreChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
  },
  genreChipSelected: {
    backgroundColor: COLORS.unisBlue,
    borderColor: COLORS.unisBlue,
  },
  genreChipText: {
    fontSize: 14,
    color: COLORS.textSilver,
  },
  genreChipTextSelected: {
    color: COLORS.accentWhite,
    fontWeight: '600',
  },
  themeSwatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingVertical: 4,
  },
  themeSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  themeSwatchSelected: {
    borderColor: COLORS.accentWhite,
  },

  // Filter Chips
  filterChips: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
  },
  filterChipActive: {
    backgroundColor: COLORS.unisBlue,
    borderColor: COLORS.unisBlue,
  },
  filterChipText: {
    fontSize: 13,
    color: COLORS.textSilver,
  },
  filterChipTextActive: {
    color: COLORS.accentWhite,
    fontWeight: '600',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyStateText: {
    fontSize: 15,
    color: COLORS.textGray,
    marginTop: 16,
  },

  // Artists Grid
  artistsGrid: {
    gap: 12,
  },
  artistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 12,
  },
  artistCardSelected: {
    borderColor: COLORS.unisBlue,
    backgroundColor: 'rgba(22, 51, 135, 0.1)',
  },
  artistCardPlaying: {
    borderColor: COLORS.successGreen,
  },
  artistPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  artistPhotoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.unisBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  artistPhotoInitial: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.accentWhite,
  },
  artistInfo: {
    flex: 1,
  },
  artistName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.accentWhite,
    marginBottom: 4,
  },
  jurisdictionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    marginBottom: 4,
  },
  jurisdictionBadgeText: {
    fontSize: 11,
    color: COLORS.textGray,
  },
  artistSongTitle: {
    fontSize: 12,
    color: COLORS.textGray,
    fontStyle: 'italic',
  },
  artistPlayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectIndicatorChecked: {
    backgroundColor: COLORS.successGreen,
    borderColor: COLORS.successGreen,
  },

  // Review
  reviewCard: {
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    marginBottom: 16,
  },
  reviewCardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textGray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  reviewItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  reviewItemLabel: {
    fontSize: 14,
    color: COLORS.textGray,
  },
  reviewItemValue: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.accentWhite,
  },
  reviewItemValueWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Agreement
  agreementSection: {
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    marginBottom: 20,
  },
  agreementTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.accentWhite,
    marginBottom: 12,
  },
  agreementItem: {
    fontSize: 13,
    color: COLORS.textGray,
    lineHeight: 20,
    marginBottom: 8,
  },
  checkboxGroup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.unisBlue,
    borderColor: COLORS.unisBlue,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textSilver,
    lineHeight: 20,
  },

  // Success Animation
  successAnimation: {
    alignItems: 'center',
    padding: 40,
  },
  checkmarkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.successGreen,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.accentWhite,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 15,
    color: COLORS.textGray,
  },

  // Navigation
  navigation: {
    flexDirection: 'row',
    gap: 12,
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  secondaryNavButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
  },
  secondaryNavButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSilver,
  },
  primaryNavButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: COLORS.unisBlue,
    borderRadius: 12,
  },
  primaryNavButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.accentWhite,
  },
});

export default CreateAccountWizard;