import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { X } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';
import { GENRE_IDS, JURISDICTION_IDS, INTERVAL_IDS } from '../utils/IdMappings';
import PremiumPicker from './Premiumpicker';
import ConfettiCannon from './Confetticannon';

import type {
  Nominee,
  VoteFilters,
  VoteResult,
  VotingWizardProps,
} from '../types/voting';

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const UNIS_BLUE = '#163387';
const SILVER = '#C0C0C0';
const GRAY = '#A9A9A9';
const SUBTLE_BLACK = '#1a1a1a';

const INTERVAL_OPTIONS = [
  { label: 'Day', value: 'daily' },
  { label: 'Week', value: 'weekly' },
  { label: 'Month', value: 'monthly' },
  { label: 'Quarter', value: 'quarterly' },
  { label: 'Year', value: 'annual' },
];

// ─────────────────────────────────────────────
// HELPER: Get key from jurisdiction ID
// ─────────────────────────────────────────────
const getKeyFromId = (id: string | undefined): string | undefined =>
  id ? Object.keys(JURISDICTION_IDS).find(key => JURISDICTION_IDS[key] === id) : undefined;

const formatText = (str: string): string =>
  str ? str.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';

// ─────────────────────────────────────────────
// ANIMATED SVG ICON FOR RESULTS
// ─────────────────────────────────────────────
const AnimatedResultIcon: React.FC<{ status: string }> = ({ status }) => {
  const drawAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        damping: 15,
        stiffness: 200,
        useNativeDriver: true,
      }),
      Animated.timing(drawAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  let borderColor = '#F44336';
  let icon = null;

  switch (status) {
    case 'success':
      borderColor = UNIS_BLUE;
      icon = (
        <Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
          <Path
            d="M20 6L9 17l-5-5"
            stroke={UNIS_BLUE}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
      break;
    case 'duplicate':
      borderColor = '#FFC107';
      icon = (
        <Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
          <Path
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            stroke="#FFC107"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
      break;
    case 'ineligible':
      borderColor = '#FF5722';
      icon = (
        <Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={10} stroke="#FF5722" strokeWidth={2} />
          <Path d="M4.93 4.93l14.14 14.14" stroke="#FF5722" strokeWidth={2} />
        </Svg>
      );
      break;
    default:
      borderColor = '#F44336';
      icon = (
        <Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
          <Path
            d="M18 6L6 18M6 6l12 12"
            stroke="#F44336"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
  }

  return (
    <Animated.View
      style={[
        styles.iconContainer,
        {
          borderColor,
          transform: [{ scale: scaleAnim }],
        },
      ]}
    >
      {icon}
    </Animated.View>
  );
};

// ─────────────────────────────────────────────
// STEP INDICATOR (the 3 dots at top)
// ─────────────────────────────────────────────
const StepIndicator: React.FC<{ currentStep: number; totalSteps: number }> = ({
  currentStep,
  totalSteps,
}) => {
  return (
    <View style={styles.stepIndicatorContainer}>
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === currentStep;
        const isCompleted = stepNum < currentStep;
        return (
          <View key={i} style={styles.stepIndicatorItem}>
            {i > 0 && (
              <View
                style={[
                  styles.stepLine,
                  (isCompleted || isActive) && styles.stepLineActive,
                ]}
              />
            )}
            <View
              style={[
                styles.stepDot,
                isActive && styles.stepDotActive,
                isCompleted && styles.stepDotCompleted,
              ]}
            >
              {isCompleted ? (
                <Svg width={10} height={10} viewBox="0 0 24 24" fill="none">
                  <Path d="M20 6L9 17l-5-5" stroke="#FFF" strokeWidth={3} strokeLinecap="round" />
                </Svg>
              ) : (
                <Text
                  style={[
                    styles.stepNumber,
                    (isActive || isCompleted) && styles.stepNumberActive,
                  ]}
                >
                  {stepNum}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
};

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
const VotingWizard: React.FC<VotingWizardProps> = ({
  visible,
  onClose,
  onVoteSuccess,
  nominee,
  userId,
  filters,
}) => {
  // --- State ---
  const [step, setStep] = useState(1);
  const [currentFilters, setCurrentFilters] = useState<VoteFilters>({
    selectedGenre: nominee?.genreKey || filters?.selectedGenre || 'rap-hiphop',
    selectedType: nominee?.type || filters?.selectedType || 'artist',
    selectedInterval: filters?.selectedInterval || 'daily',
    selectedJurisdiction: '',
  });
  const [artistNameForward, setArtistNameForward] = useState('');
  const [artistNameBackward, setArtistNameBackward] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [eligibleJurisdictionIds, setEligibleJurisdictionIds] = useState<string[]>([]);
  const [isFetchingJurisdictions, setIsFetchingJurisdictions] = useState(false);
  const [voteResult, setVoteResult] = useState<VoteResult>({ status: 'idle', message: '', details: '' });
  const [showConfetti, setShowConfetti] = useState(false);

  // --- Animations ---
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(0.85)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const backwardInputRef = useRef<TextInput>(null);

  const selectedNominee = nominee;

  // Reversed name for Step 3 verification
  const reversedNomineeName = useMemo(
    () => (selectedNominee ? selectedNominee.name.split('').reverse().join('') : ''),
    [selectedNominee]
  );

  // Jurisdiction options filtered to eligible ones
  const jurisdictionOptions = useMemo(() => {
    if (isFetchingJurisdictions) return [];
    return Object.keys(JURISDICTION_IDS)
      .filter(key => {
        if (eligibleJurisdictionIds.length === 0) return true;
        return eligibleJurisdictionIds.includes(JURISDICTION_IDS[key]);
      })
      .map(key => ({
        label: formatText(key),
        value: key,
      }));
  }, [eligibleJurisdictionIds, isFetchingJurisdictions]);

  // ─── MODAL OPEN/CLOSE ANIMATIONS ───
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(modalScale, {
          toValue: 1,
          damping: 22,
          stiffness: 400,
          useNativeDriver: true,
        }),
        Animated.timing(modalOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(modalScale, { toValue: 0.85, duration: 200, useNativeDriver: true }),
        Animated.timing(modalOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  // ─── STEP TRANSITION ANIMATION ───
  const animateStepChange = useCallback((newStep: number) => {
    Animated.timing(contentFade, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      setStep(newStep);
      Animated.timing(contentFade, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  }, []);

  // ─── SUCCESS GLOW ANIMATION ───
  useEffect(() => {
    if (voteResult.status === 'success') {
      setShowConfetti(true);
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
        ])
      ).start();
      // Stop confetti after 3 seconds
      const timer = setTimeout(() => setShowConfetti(false), 3000);
      return () => clearTimeout(timer);
    } else {
      glowAnim.setValue(0);
      setShowConfetti(false);
    }
  }, [voteResult.status]);

  // ─── RESET STATE ON OPEN ───
  useEffect(() => {
    if (visible) {
      setStep(1);
      setVoteResult({ status: 'idle', message: '', details: '' });
      setArtistNameForward('');
      setArtistNameBackward('');
      setSubmitting(false);
      setEligibleJurisdictionIds([]);
      const homeKey = getKeyFromId(nominee?.jurisdiction && typeof nominee.jurisdiction === 'object'
        ? nominee.jurisdiction.jurisdictionId
        : undefined
      );
      setCurrentFilters(prev => ({
        ...prev,
        selectedGenre: nominee?.genreKey || filters?.selectedGenre || 'rap-hiphop',
        selectedType: nominee?.type || filters?.selectedType || 'artist',
        selectedJurisdiction: homeKey || filters?.selectedJurisdiction || 'harlem',
      }));
    }
  }, [visible, nominee, filters]);

  // ─── FETCH ELIGIBLE JURISDICTIONS (BREADCRUMB) ───
  useEffect(() => {
    if (!visible || !nominee) return;

    const fetchEligibleJurisdictions = async () => {
      setIsFetchingJurisdictions(true);

      // Determine nominee's jurisdiction ID
      let nomineeJurisdictionId: string | null = null;

      if (nominee.jurisdiction) {
        if (typeof nominee.jurisdiction === 'object' && nominee.jurisdiction.jurisdictionId) {
          nomineeJurisdictionId = nominee.jurisdiction.jurisdictionId;
        } else if (typeof nominee.jurisdiction === 'string') {
          const jurisdictionName = nominee.jurisdiction.toLowerCase().replace(/\s+/g, '-');
          nomineeJurisdictionId = JURISDICTION_IDS[jurisdictionName] || null;
        }
      }

      // If missing, fetch from backend
      if (!nomineeJurisdictionId && nominee.id && nominee.type) {
        try {
          const endpoint = nominee.type === 'artist'
            ? `/v1/users/${nominee.id}`
            : `/v1/media/song/${nominee.id}`;
          const response = await axiosInstance.get(endpoint);
          const fetchedJurisdiction = response.data.jurisdiction;
          if (fetchedJurisdiction?.jurisdictionId) {
            nomineeJurisdictionId = fetchedJurisdiction.jurisdictionId;
          }
        } catch (err) {
          console.error('Failed to fetch nominee jurisdiction:', err);
        }
      }

      // Fallback: show all
      if (!nomineeJurisdictionId) {
        setEligibleJurisdictionIds(Object.values(JURISDICTION_IDS));
        setIsFetchingJurisdictions(false);
        return;
      }

      try {
        const response = await axiosInstance.get(`/v1/jurisdictions/${nomineeJurisdictionId}/breadcrumb`);
        const eligibleIds = response.data
          .filter((j: any) => j.votingEnabled !== false)
          .map((j: any) => j.jurisdictionId);

        setEligibleJurisdictionIds(eligibleIds);

        // Auto-correct if current selection is invalid
        const currentId = JURISDICTION_IDS[currentFilters.selectedJurisdiction];
        if (currentId && !eligibleIds.includes(currentId)) {
          const homeKey = getKeyFromId(nomineeJurisdictionId);
          if (homeKey) {
            setCurrentFilters(prev => ({ ...prev, selectedJurisdiction: homeKey }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch eligible jurisdictions:', err);
        // Fallback logic for known jurisdictions
        const homeKey = getKeyFromId(nomineeJurisdictionId);
        let fallbackIds: string[] = [];
        if (homeKey === 'downtown-harlem' || homeKey === 'uptown-harlem') {
          fallbackIds = [JURISDICTION_IDS[homeKey], JURISDICTION_IDS['harlem']];
        } else if (homeKey === 'harlem') {
          fallbackIds = [JURISDICTION_IDS['harlem']];
        } else {
          fallbackIds = Object.values(JURISDICTION_IDS);
        }
        setEligibleJurisdictionIds(fallbackIds);
      } finally {
        setIsFetchingJurisdictions(false);
      }
    };

    fetchEligibleJurisdictions();
  }, [visible, nominee]);

  // ─── HANDLERS ───
  const handleNext = () => {
    setVoteResult({ status: 'idle', message: '', details: '' });
    if (step < 3) animateStepChange(step + 1);
  };

  const handleBack = () => {
    if (step > 1) animateStepChange(step - 1);
  };

  const handleConfirmVote = async () => {
    if (!selectedNominee) return;
    setVoteResult({ status: 'idle', message: '', details: '' });

    if (artistNameForward.toLowerCase() !== selectedNominee.name.toLowerCase()) {
      setVoteResult({
        status: 'error',
        message: 'Name Forward Invalid',
        details: 'The name entered forward does not match.',
      });
      return;
    }
    if (artistNameBackward.toLowerCase() !== reversedNomineeName.toLowerCase()) {
      setVoteResult({
        status: 'error',
        message: 'Name Backward Invalid',
        details: 'The name entered backward does not match.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const voteData = {
        userId,
        targetType: currentFilters.selectedType,
        targetId: selectedNominee.id,
        genreId: GENRE_IDS[currentFilters.selectedGenre],
        jurisdictionId: JURISDICTION_IDS[currentFilters.selectedJurisdiction],
        intervalId: INTERVAL_IDS[currentFilters.selectedInterval],
        voteDate: new Date().toISOString().split('T')[0],
      };

      console.log('=== VOTE DATA BEING SENT ===', JSON.stringify(voteData, null, 2));
      await axiosInstance.post('/v1/vote/submit', voteData);

      // Animate to result with a brief delay for dramatic effect
      Animated.timing(contentFade, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setVoteResult({ status: 'success', message: 'Vote Recorded' });
        Animated.timing(contentFade, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 409) {
        setVoteResult({ status: 'duplicate', message: 'Already Voted', details: 'You have already cast a vote in this category for this interval.' });
      } else if (status === 403) {
        setVoteResult({ status: 'ineligible', message: 'Vote Rejected', details: 'You are not eligible to vote in this jurisdiction.' });
      } else {
        setVoteResult({ status: 'network', message: 'Connection Failed', details: 'We could not reach the server.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─── RENDER: RESULT SCREEN ───
  const renderResult = () => {
    const { status, message, details } = voteResult;
    const isSuccess = status === 'success';
    const statusColor =
      status === 'success' ? UNIS_BLUE :
      status === 'duplicate' ? '#FFC107' :
      status === 'ineligible' ? '#FF5722' : '#F44336';

    return (
      <ScrollView
        contentContainerStyle={styles.stepContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo placeholder - use text since we handle SVG imports as components */}
        <Text style={styles.resultLogoText}>UNIS</Text>

        <AnimatedResultIcon status={status} />

        <Text style={[styles.resultHeader, { color: statusColor }]}>
          {message}
        </Text>

        {isSuccess && selectedNominee ? (
          <View style={styles.voteReceipt}>
            <Text style={styles.receiptLabel}>CONFIRMED NOMINEE</Text>
            <Text style={styles.receiptName}>{selectedNominee.name}</Text>

            {/* Gradient divider */}
            <View style={styles.receiptDivider} />

            <View style={styles.receiptMetaGrid}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Type</Text>
                <Text style={styles.metaValue}>{formatText(currentFilters.selectedType)}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Interval</Text>
                <Text style={styles.metaValue}>{formatText(currentFilters.selectedInterval)}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Jurisdiction</Text>
                <Text style={styles.metaValue}>{formatText(currentFilters.selectedJurisdiction)}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Genre</Text>
                <Text style={styles.metaValue}>{formatText(currentFilters.selectedGenre)}</Text>
              </View>
            </View>
          </View>
        ) : (
          <Text style={styles.errorDetails}>{details}</Text>
        )}

        <View style={styles.buttonGroupResult}>
          {isSuccess ? (
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => onVoteSuccess(selectedNominee!.id)}
              activeOpacity={0.8}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                setVoteResult({ status: 'idle', message: '', details: '' });
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.backButtonText}>Try Again</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    );
  };

  // ─── RENDER: STEP 1 — CONFIRM SELECTIONS ───
  const renderStep1 = () => (
    <ScrollView
      contentContainerStyle={styles.stepContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.stepTitle}>Confirm Your Vote For</Text>
      <Text style={styles.nomineeName}>{selectedNominee?.name}</Text>
      <Text style={styles.wizardIntro}>Please review your selections below.</Text>

      <View style={styles.filterGrid}>
        {/* Genre — Locked */}
        <Text style={styles.filterLabel}>Genre</Text>
        <View style={styles.lockedInput}>
          <Text style={styles.lockedInputText}>
            {currentFilters.selectedGenre.replace(/-/g, ' ').toUpperCase()}
          </Text>
        </View>

        {/* Category — Locked */}
        <Text style={styles.filterLabel}>Category</Text>
        <View style={styles.lockedInput}>
          <Text style={styles.lockedInputText}>
            {currentFilters.selectedType.toUpperCase()}
          </Text>
        </View>

        {/* Interval — Selectable */}
        <Text style={styles.filterLabel}>Interval</Text>
        <PremiumPicker
          options={INTERVAL_OPTIONS}
          selectedValue={currentFilters.selectedInterval}
          onValueChange={(val) => setCurrentFilters(prev => ({ ...prev, selectedInterval: val }))}
        />

        {/* Jurisdiction — Selectable, filtered to eligible */}
        <Text style={styles.filterLabel}>Jurisdiction</Text>
        <PremiumPicker
          options={jurisdictionOptions}
          selectedValue={currentFilters.selectedJurisdiction}
          onValueChange={(val) => setCurrentFilters(prev => ({ ...prev, selectedJurisdiction: val }))}
          loading={isFetchingJurisdictions}
          disabled={isFetchingJurisdictions}
        />
      </View>
    </ScrollView>
  );

  // ─── RENDER: STEP 2 — FINAL CONFIRMATION ───
  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Final Confirmation</Text>
      <Text style={styles.wizardIntro}>You are about to cast your vote for:</Text>

      <View style={styles.confirmationSummary}>
        <Text style={styles.confirmationName}>{selectedNominee?.name}</Text>
        <View style={styles.confirmationDividerThin} />
        <Text style={styles.confirmationDetail}>
          as <Text style={styles.confirmationBold}>{formatText(currentFilters.selectedType)}</Text>
        </Text>
        <Text style={styles.confirmationDetail}>
          of the <Text style={styles.confirmationBold}>{formatText(currentFilters.selectedInterval)}</Text>
        </Text>
        <Text style={styles.confirmationDetail}>
          in <Text style={styles.confirmationBold}>{formatText(currentFilters.selectedGenre)}</Text>
        </Text>
      </View>

      <View style={styles.warningContainer}>
        <Text style={styles.warningText}>⚠ This vote cannot be undone.</Text>
      </View>
    </View>
  );

  // ─── RENDER: STEP 3 — NAME VERIFICATION ───
  const renderStep3 = () => (
    <ScrollView
      contentContainerStyle={styles.stepContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.stepTitle}>Secure Your Vote</Text>
      <Text style={styles.wizardIntro}>
        To prevent errors, please confirm by typing the name forward and backward.
      </Text>

      <View style={styles.formGroup}>
        <Text style={styles.filterLabel}>
          Name (Forward) — <Text style={styles.hintText}>{selectedNominee?.name}</Text>
        </Text>
        <TextInput
          style={styles.textInput}
          value={artistNameForward}
          onChangeText={setArtistNameForward}
          placeholder="Type the name forward..."
          placeholderTextColor="#555"
          editable={!submitting}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          onSubmitEditing={() => backwardInputRef.current?.focus()}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.filterLabel}>
          (Backward) — <Text style={[styles.hintText, { color: '#4477CC' }]}>{reversedNomineeName}</Text>
        </Text>
        <TextInput
          ref={backwardInputRef}
          style={styles.textInput}
          value={artistNameBackward}
          onChangeText={setArtistNameBackward}
          placeholder="Type the name backward..."
          placeholderTextColor="#555"
          editable={!submitting}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleConfirmVote}
        />
      </View>

      <TouchableOpacity
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        onPress={handleConfirmVote}
        disabled={submitting}
        activeOpacity={0.8}
      >
        {submitting ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <Text style={styles.submitButtonText}>Confirm Vote</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );

  // ─── RENDER: STEP ROUTER ───
  const renderStep = () => {
    if (voteResult.status !== 'idle') return renderResult();
    if (!selectedNominee) return null;

    switch (step) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      default: return null;
    }
  };

  // ─── DYNAMIC GLOW BORDER ───
  const glowShadowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  const glowBorderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(22, 51, 135, 0.4)', 'rgba(22, 51, 135, 1)'],
  });

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Confetti layer */}
        {showConfetti && <ConfettiCannon />}

        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        {/* Modal Card */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <Animated.View
            style={[
              styles.wizardCard,
              {
                opacity: modalOpacity,
                transform: [{ scale: modalScale }],
              },
              voteResult.status === 'success' && {
                borderColor: glowBorderColor as any,
                borderWidth: 2,
                shadowColor: UNIS_BLUE,
                shadowOpacity: glowShadowOpacity as any,
                shadowRadius: 20,
                elevation: 20,
              },
            ]}
          >
            {/* Close Button */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={22} color={GRAY} />
            </TouchableOpacity>

            {/* Step Indicator */}
            {voteResult.status === 'idle' && (
              <StepIndicator currentStep={step} totalSteps={3} />
            )}

            {/* Step Content */}
            <Animated.View style={{ opacity: contentFade, flex: 1 }}>
              {renderStep()}
            </Animated.View>

            {/* Navigation Buttons (only when in wizard flow) */}
            {voteResult.status === 'idle' && (
              <View style={styles.buttonGroup}>
                {step > 1 && (
                  <TouchableOpacity
                    style={styles.backButton}
                    onPress={handleBack}
                    disabled={submitting}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.backButtonText}>Back</Text>
                  </TouchableOpacity>
                )}
                {step < 3 && (
                  <TouchableOpacity
                    style={[styles.nextButton, step === 1 && { flex: 1 }]}
                    onPress={handleNext}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.nextButtonText}>Next</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  // -- Overlay & Backdrop --
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
  },
  keyboardAvoid: {
    width: '100%',
    maxWidth: 500,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },

  // -- Wizard Card --
  wizardCard: {
    backgroundColor: '#0D0D0F',
    borderRadius: 20,
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(192, 192, 192, 0.08)',
    // Subtle inner glow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 15,
    maxHeight: SCREEN_HEIGHT * 0.82,
  },

  // -- Close Button --
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // -- Step Indicator --
  stepIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    marginTop: 4,
  },
  stepIndicatorItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepLine: {
    width: 40,
    height: 2,
    backgroundColor: 'rgba(192, 192, 192, 0.15)',
    marginHorizontal: 4,
    borderRadius: 1,
  },
  stepLineActive: {
    backgroundColor: UNIS_BLUE,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(192, 192, 192, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    borderColor: UNIS_BLUE,
    backgroundColor: 'rgba(22, 51, 135, 0.2)',
  },
  stepDotCompleted: {
    backgroundColor: UNIS_BLUE,
    borderColor: UNIS_BLUE,
  },
  stepNumber: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(192, 192, 192, 0.5)',
  },
  stepNumberActive: {
    color: '#FFF',
  },

  // -- Step Content --
  stepContent: {
    alignItems: 'center',
    paddingBottom: 10,
  },
  stepTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
    textAlign: 'center',
  },
  nomineeName: {
    color: UNIS_BLUE,
    fontSize: 28,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginVertical: 8,
    textAlign: 'center',
    // If you have Bitcount Grid Double loaded via expo-font, uncomment:
    // fontFamily: 'BitcountGridDouble',
  },
  wizardIntro: {
    color: GRAY,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 22,
    textAlign: 'center',
  },

  // -- Filter Grid (Step 1) --
  filterGrid: {
    width: '100%',
  },
  filterLabel: {
    color: SILVER,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 6,
    marginLeft: 2,
  },
  lockedInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
  },
  lockedInputText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '500',
    fontStyle: 'italic',
  },

  // -- Confirmation Summary (Step 2) --
  confirmationSummary: {
    backgroundColor: 'rgba(22, 51, 135, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(22, 51, 135, 0.25)',
    borderRadius: 14,
    paddingVertical: 24,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  confirmationName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  confirmationDividerThin: {
    width: '60%',
    height: 1,
    backgroundColor: 'rgba(22, 51, 135, 0.3)',
    marginBottom: 14,
  },
  confirmationDetail: {
    color: SILVER,
    fontSize: 15,
    lineHeight: 26,
    textAlign: 'center',
  },
  confirmationBold: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  warningContainer: {
    backgroundColor: 'rgba(255, 193, 7, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.2)',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: '100%',
  },
  warningText: {
    color: '#FFC107',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.3,
  },

  // -- Form (Step 3) --
  formGroup: {
    width: '100%',
    marginBottom: 16,
  },
  hintText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'none',
    letterSpacing: 0,
  },
  textInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(192, 192, 192, 0.15)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: UNIS_BLUE,
    borderRadius: 10,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: UNIS_BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  submitButtonDisabled: {
    backgroundColor: '#444',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },

  // -- Result Screen --
  resultLogoText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 6,
    marginBottom: 20,
    // If Bitcount Grid Double is loaded:
    // fontFamily: 'BitcountGridDouble',
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    marginBottom: 16,
  },
  resultHeader: {
    fontSize: 20,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  voteReceipt: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(22, 51, 135, 0.3)',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  receiptLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 3,
    color: GRAY,
    marginBottom: 6,
  },
  receiptName: {
    fontSize: 22,
    color: '#FFFFFF',
    fontWeight: '800',
    marginBottom: 14,
  },
  receiptDivider: {
    width: '100%',
    height: 1,
    marginBottom: 16,
    backgroundColor: 'rgba(22, 51, 135, 0.3)',
  },
  receiptMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  metaItem: {
    width: '50%',
    marginBottom: 12,
  },
  metaLabel: {
    fontSize: 10,
    color: '#918f8f',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  errorDetails: {
    color: GRAY,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 10,
  },

  // -- Buttons --
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 8,
  },
  buttonGroupResult: {
    width: '100%',
    alignItems: 'center',
  },
  nextButton: {
    flex: 1,
    backgroundColor: UNIS_BLUE,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: UNIS_BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  backButton: {
    borderWidth: 1,
    borderColor: 'rgba(169, 169, 169, 0.4)',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  backButtonText: {
    color: SILVER,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  doneButton: {
    backgroundColor: UNIS_BLUE,
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    shadowColor: UNIS_BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});

export default VotingWizard;