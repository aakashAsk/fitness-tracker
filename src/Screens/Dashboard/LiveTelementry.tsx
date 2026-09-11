import React from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { StrainCard } from '../../Components/StrainedCard';
import { HeartZoneCard } from '../../Components/HeartZoneCard';
import { PerformanceIndexCard } from '../../Components/PerformanceIndexCard';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../../Theme/colors';

export const TelemetryDashboard: React.FC = () => {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.neutral} />
        {/* Top Header */}
        <View style={styles.topHeader}>
          <View style={styles.liveIndicator}>
            <View style={styles.liveGreenDot} />
            <Text style={styles.liveTitle}>Live Telemetry</Text>
          </View>
          <View style={styles.syncBadge}>
            <Text style={styles.syncText}>SYNCED 2M AGO</Text>
          </View>
        </View>

        {/* 1. Weekly Strain Load Component */}
        <StrainCard />

        {/* 2. Heart & Autonomic Zone Component */}
        <HeartZoneCard />

        {/* 3. Performance Index Component */}
        <PerformanceIndexCard />
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.neutral,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginBottom: 4,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveGreenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  liveTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.3,
  },
  syncBadge: {
    backgroundColor: colors.cardBackgroud,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  syncText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
    color: colors.primaryHighlight,
  },
});

export default TelemetryDashboard;
