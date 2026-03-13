import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/lib/store';
import { useTheme } from '@/lib/useTheme';
import TimetomotoLogo from '@/components/common/TimetomotoLogo';
import { LOGO_WIDTH, LOGO_HEIGHT } from '@/lib/headerLayout';

const PANEL_WIDTH = 280;

interface Props {
  open: boolean;
  onClose: () => void;
}

interface MenuItemProps {
  icon: string;
  label: string;
  onPress: () => void;
  iconColor?: string;
  labelColor?: string;
}

function MenuItem({ icon, label, onPress, iconColor, labelColor }: MenuItemProps) {
  const { theme } = useTheme();
  return (
    <Pressable
      style={[styles.menuItem, { backgroundColor: theme.bgPanel }]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Feather name={icon as any} size={18} color={iconColor ?? theme.textSecondary} />
      <Text style={[styles.menuItemLabel, { color: labelColor ?? theme.textPrimary }]}>
        {label}
      </Text>
      <Feather name="chevron-right" size={14} color={theme.border} style={styles.chevron} />
    </Pressable>
  );
}

export default function HamburgerMenu({ open, onClose }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuthStore();

  const [modalVisible, setModalVisible] = useState(open);
  const slideAnim = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setModalVisible(true);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 220,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -PANEL_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setModalVisible(false);
      });
    }
  }, [open]);

  function navigate(path: string) {
    onClose();
    setTimeout(() => router.push(path as any), 250);
  }

  async function handleLogout() {
    onClose();
    await signOut();
    router.replace('/auth');
  }

  const displayName = user?.user_metadata?.display_name ?? '';
  const userEmail = user?.email ?? '';

  return (
    <Modal
      transparent
      visible={modalVisible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Dim overlay */}
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} />
      </TouchableWithoutFeedback>

      {/* Slide-in panel */}
      <Animated.View
        style={[
          styles.panel,
          {
            backgroundColor: theme.bgPanel,
            borderRightColor: theme.border,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        {/* User area */}
        <View style={[styles.userArea, { borderBottomColor: theme.border }]}>
          <View style={styles.panelHeader}>
            <TimetomotoLogo width={LOGO_WIDTH} height={LOGO_HEIGHT} />
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={18} color={theme.textMuted} />
            </Pressable>
          </View>
          {(displayName || userEmail) ? (
            <View style={styles.userEmailRow}>
              <View style={[styles.avatarCircle, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
                <Feather name="user" size={16} color={theme.textSecondary} />
              </View>
              <Text style={[styles.userEmail, { color: theme.textSecondary }]} numberOfLines={1}>
                {displayName || userEmail}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Menu items */}
        <View style={styles.menuList}>
          <MenuItem
            icon="user"
            label="MY ACCOUNT"
            onPress={() => navigate('/account')}
          />
          <MenuItem
            icon="tool"
            label="MY GARAGE"
            onPress={() => navigate('/(tabs)/garage')}
          />
          <MenuItem
            icon="shield"
            label="EMERGENCY CONTACTS"
            onPress={() => navigate('/emergency-contacts')}
          />
          <MenuItem
            icon="settings"
            label="SETTINGS"
            onPress={() => navigate('/settings')}
          />
          <MenuItem
            icon="mail"
            label="HELP & CONTACT"
            onPress={() => navigate('/help-contact')}
          />

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <MenuItem
            icon="log-out"
            label="LOGOUT"
            onPress={handleLogout}
            iconColor={theme.red}
            labelColor={theme.red}
          />
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: PANEL_WIDTH,
    borderRightWidth: 1,
  },
  userArea: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    padding: 4,
  },
  userEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userEmail: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  menuList: {
    flex: 1,
  },
  menuItem: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 14,
  },
  menuItemLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: 'BarlowCondensed',
  },
  chevron: {
    marginLeft: 'auto',
  },
  divider: {
    height: 1,
    marginHorizontal: 20,
    marginVertical: 8,
  },
});
