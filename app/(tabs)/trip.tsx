import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import DiscoverRoutes from '../../components/trip/DiscoverRoutes';
import TripPlanner from '../../components/trip/TripPlanner';
import HamburgerButton from '../../components/navigation/HamburgerButton';
import HamburgerMenu from '../../components/navigation/HamburgerMenu';
import { useTheme } from '../../lib/useTheme';

// ---------------------------------------------------------------------------
// Plan screen — Trip Planner fills the screen, My Routes opens as modal
// ---------------------------------------------------------------------------

export default function PlanScreen() {
  const { theme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [routesModalOpen, setRoutesModalOpen] = useState(false);

  return (
    <View style={s.root}>
      {/* Trip Planner — full screen */}
      <TripPlanner />

      {/* Floating controls over the map */}
      <View style={[s.floatingTopLeft, { top: Platform.OS === 'ios' ? 52 : 10 }]} pointerEvents="box-none">
        <HamburgerButton onPress={() => setMenuOpen(true)} />
      </View>

      <View style={[s.floatingTopCenter, { top: Platform.OS === 'ios' ? 56 : 14 }]} pointerEvents="box-none">
        <Pressable
          style={[s.myRoutesBtn, { backgroundColor: theme.bgPanel, borderColor: theme.border }]}
          onPress={() => setRoutesModalOpen(true)}
        >
          <Feather name="bookmark" size={14} color={theme.textSecondary} />
          <Text style={[s.myRoutesBtnText, { color: theme.textSecondary }]}>MY ROUTES</Text>
        </Pressable>
      </View>

      {/* My Routes modal */}
      <Modal visible={routesModalOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setRoutesModalOpen(false)}>
        <View style={[s.modalContainer, { backgroundColor: theme.bgPanel }]}>
          {/* Drag handle */}
          <View style={s.dragHandleWrap}>
            <View style={[s.dragHandle, { backgroundColor: theme.border }]} />
          </View>
          {/* Header */}
          <View style={[s.modalHeader, { borderBottomColor: theme.border }]}>
            <View style={{ width: 20 }} />
            <Text style={[s.modalTitle, { color: theme.textPrimary }]}>MY ROUTES</Text>
            <Pressable onPress={() => setRoutesModalOpen(false)} hitSlop={12}>
              <Feather name="x" size={20} color={theme.textMuted} />
            </Pressable>
          </View>
          <DiscoverRoutes />
        </View>
      </Modal>

      <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  root: { flex: 1 },

  floatingTopLeft: {
    position: 'absolute',
    left: 12,
    zIndex: 10,
  },
  floatingTopCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  myRoutesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
  },
  myRoutesBtnText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  modalContainer: { flex: 1 },
  dragHandleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  dragHandle: { width: 36, height: 4, borderRadius: 2 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 15, fontWeight: '800', letterSpacing: 1.2 },
});
