import React from 'react';
import { View, Text, Pressable, TextInput, ScrollView, StyleSheet } from 'react-native';
import { ChevronUp, ChevronDown, Pencil, Search, X } from 'lucide-react-native';
import { colors } from '../../Theme/colors';
import { radius } from '../../Theme/spacing';
import { ExerciseItem } from './Types';
import { EXERCISE_CATEGORY_FILTERS } from './Data';

interface ExerciseListProps {
  exercises: ExerciseItem[];
  onMoveExercise: (index: number, direction: 'up' | 'down') => void;
  onEditExercise: (exercise: ExerciseItem) => void;
  searchFilter: string;
  onSearchFilterChange: (value: string) => void;
  selectedCategory: string;
  onSelectedCategoryChange: (category: string) => void;
}

export const ExerciseList: React.FC<ExerciseListProps> = ({
  exercises,
  onMoveExercise,
  onEditExercise,
  searchFilter,
  onSearchFilterChange,
  selectedCategory,
  onSelectedCategoryChange,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Curated Exercises</Text>
          <Text style={styles.countPill}>{exercises.length}</Text>
        </View>
        <Text style={styles.headerMeta}>Push Block</Text>
      </View>

      {/* Reorderable Selected Exercise Items */}
      <View style={styles.list}>
        {exercises.map((ex, idx) => (
          <View key={ex.id} style={styles.item}>
            <View style={styles.itemLeft}>
              <View style={styles.reorder}>
                <Pressable
                  onPress={() => onMoveExercise(idx, 'up')}
                  disabled={idx === 0}
                  style={idx === 0 && styles.disabled}
                  hitSlop={6}
                >
                  <ChevronUp size={14} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  onPress={() => onMoveExercise(idx, 'down')}
                  disabled={idx === exercises.length - 1}
                  style={idx === exercises.length - 1 && styles.disabled}
                  hitSlop={6}
                >
                  <ChevronDown size={14} color={colors.textMuted} />
                </Pressable>
              </View>
              <View style={styles.itemText}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {ex.name}
                </Text>
                <Text style={styles.itemMeta}>
                  {ex.sets} sets × {ex.reps} · {ex.rest}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => onEditExercise(ex)}
              style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}
            >
              <Pencil size={14} color={colors.textSecondary} />
            </Pressable>
          </View>
        ))}
      </View>

      {/* Quick Library Search Bar & Filter Chips */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            value={searchFilter}
            onChangeText={onSearchFilterChange}
            placeholder="Add more exercises to Push block..."
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
          {searchFilter ? (
            <Pressable onPress={() => onSearchFilterChange('')} hitSlop={8}>
              <X size={16} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {EXERCISE_CATEGORY_FILTERS.map((cat: any) => {
            const isActive = selectedCategory === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => onSelectedCategoryChange(cat)}
                style={[styles.chip, isActive ? styles.chipActive : styles.chipIdle]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: isActive ? colors.onPrimary : colors.textSecondary },
                    isActive && styles.chipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 10 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 14, fontWeight: '700', color: colors.white },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  headerMeta: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
  list: { gap: 8 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    backgroundColor: colors.cardBackgroud,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 12,
  },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  reorder: { alignItems: 'center' },
  disabled: { opacity: 0.2 },
  itemText: { flexShrink: 1 },
  itemName: { fontSize: 14, fontWeight: '700', color: colors.white },
  itemMeta: { fontSize: 12, color: colors.textSecondary },
  editBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.DEFAULT,
    backgroundColor: colors.surfaceContainerHighest,
  },
  pressed: { opacity: 0.7 },
  searchWrap: { gap: 8, paddingTop: 4 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: colors.cardBackgroud,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  searchInput: { flex: 1, fontSize: 12, color: colors.white, padding: 0 },
  chips: { gap: 6, paddingBottom: 4 },
  chip: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary },
  chipIdle: { backgroundColor: colors.cardBackgroud },
  chipText: { fontSize: 12, fontWeight: '600' },
  chipTextActive: { fontWeight: '700' },
});

export default ExerciseList;
