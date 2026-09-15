import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Keyboard,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import {
    ArrowRight,
    Check,
    ChevronDown,
    ChevronUp,
    Clock,
    Plus,
    Trash2,
    UtensilsCrossed,
    X,
} from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { radius, spacing } from '../../Theme/spacing';
import { DAY_ORDER, todayDayKey } from '../Workout/Data';
import type { DayKey } from '../Workout/Types';
import {
    DEFAULT_MEAL_TIME,
    MEAL_TYPES,
    type MealItem,
    type MealType,
} from '../../Services/mealPlanService';

export interface MealPlanPayload {
    name: string;
    mealType: MealType;
    items: MealItem[];
    days: DayKey[];
    /** e.g. "8:30 AM" */
    time: string;
}

interface NewMealPlanModalProps {
    onClose: () => void;
    onCreate: (payload: MealPlanPayload) => void;
    saving?: boolean;
    /** Pre-fills the sheet to edit an existing plan instead of adding one. */
    initialPlan?: MealPlanPayload;
    /**
     * Editing one day's log rather than the recurring plan: the training
     * days are hidden and passed straight back, because a logged meal
     * belongs to a single date and has no schedule to change.
     */
    logMode?: boolean;
    /** "YYYY-MM-DD" of the day being logged, shown in the header. */
    logDateLabel?: string;
}

const EMPTY_ITEM: MealItem = { name: '', quantity: '', unit: 'g' };
/** Units a food item can be measured in. Kept short for now — more can
 * be appended here and the picker picks them up with no other change. */
const UNITS = ['g', 'ml', 'piece', 'scoop', 'cup', 'tbsp', 'tsp'];

function toDayRecord(days?: DayKey[]): Record<DayKey, boolean> {
    const selected = new Set(days ?? []);
    return DAY_ORDER.reduce(
        (acc, day) => ({ ...acc, [day]: selected.has(day) }),
        {} as Record<DayKey, boolean>,
    );
}

function parseTime(time?: string): { hour: number; minute: number; period: 'AM' | 'PM' } {
    const match = time?.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return { hour: 8, minute: 0, period: 'AM' };
    return {
        hour: parseInt(match[1], 10),
        minute: parseInt(match[2], 10),
        period: match[3].toUpperCase() === 'AM' ? 'AM' : 'PM',
    };
}

export const NewMealPlanModal: React.FC<NewMealPlanModalProps> = ({
    onClose,
    onCreate,
    saving = false,
    initialPlan,
    logMode = false,
    logDateLabel,
}) => {
    const isEditing = !!initialPlan;

    // Mounted only while open, so Modal would start life already
    // visible and skip its slide-in. Flipping on the next frame gives
    // it the false -> true transition it animates on.
    const [isVisible, setIsVisible] = useState(false);
    useEffect(() => {
        const frame = requestAnimationFrame(() => setIsVisible(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    const initialType: MealType = initialPlan?.mealType ?? 'breakfast';
    const initialTime = parseTime(initialPlan?.time ?? DEFAULT_MEAL_TIME[initialType]);

    const [name, setName] = useState(initialPlan?.name ?? '');
    const [mealType, setMealType] = useState<MealType>(initialType);
    const [items, setItems] = useState<MealItem[]>(
        initialPlan?.items?.length ? initialPlan.items : [{ ...EMPTY_ITEM }],
    );
    // Same as the workout sheet: a new plan starts on today's weekday,
    // an existing one keeps the days it was saved with.
    const [days, setDays] = useState<Record<DayKey, boolean>>(() =>
        toDayRecord(initialPlan ? initialPlan.days : [todayDayKey()]),
    );
    const [hour, setHour] = useState(initialTime.hour);
    const [minute, setMinute] = useState(initialTime.minute);
    const [period, setPeriod] = useState<'AM' | 'PM'>(initialTime.period);
    const [formError, setFormError] = useState<string | null>(null);

    // Whether the user has set the time themselves. Editing an existing
    // plan counts as touched from the start: its saved time is a real
    // choice, and switching meal type should not quietly discard it.
    const timeTouched = useRef(!!initialPlan);

    /**
     * Picking a meal type moves the clock to when that meal usually
     * happens — breakfast to 8 AM, lunch to 1 PM, and so on — but only
     * while the dial is untouched, so it can never overwrite a time the
     * user chose deliberately.
     */
    const chooseMealType = (next: MealType) => {
        setMealType(next);
        if (timeTouched.current) return;

        // Not every type has a sensible default — see DEFAULT_MEAL_TIME.
        // Without this guard parseTime would fall back to its own 8 AM
        // and yank the dial there, which is worse than leaving it alone.
        const defaultTime = DEFAULT_MEAL_TIME[next];
        if (!defaultTime) return;

        const suggested = parseTime(defaultTime);
        setHour(suggested.hour);
        setMinute(suggested.minute);
        setPeriod(suggested.period);
    };
    /** Index of the item row whose unit picker is open, or null. */
    const [unitPickerFor, setUnitPickerFor] = useState<number | null>(null);

    // Same approach as the workout sheet: KeyboardAvoidingView measures
    // unreliably inside a Modal on Android, so the inset is applied by
    // hand from the keyboard events.
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const showSub = Keyboard.addListener(showEvent, (event) =>
            setKeyboardHeight(event.endCoordinates?.height ?? 0),
        );
        const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);



    // The modal's own content box, measured rather than assumed. An RN
    // <Modal> on Android is a separate window: it does not inherit the
    // activity's adjustResize, and its height is not the app window's.
    // Measuring is the only thing that is true on both platforms.
    const [overlayHeight, setOverlayHeight] = useState(0);

    // Lift the sheet clear of the keyboard, and cap it so that lift can
    // never push its top off the screen. Correct whether or not the
    // window itself resized: either way the sheet plus its lift comes to
    // the measured height minus the gap.
    const sheetSizing =
      overlayHeight > 0
        ? {
            marginBottom: keyboardHeight,
            maxHeight: Math.max(overlayHeight - keyboardHeight - 24, 220),
          }
        : undefined;

    const bodyRef = useRef<ScrollView>(null);

    // Nothing scrolls a focused field into view on its own: RN's
    // automaticallyAdjustKeyboardInsets is iOS-only, and Android's
    // window resize shortens the sheet without moving its content. So
    // each section records its own offset inside the scroll content,
    // and focusing an input scrolls to it by hand.
    const sectionY = useRef<Record<string, number>>({});
    const itemRowY = useRef<Record<number, number>>({});

    const scrollToField = (section: string, offsetWithinSection = 0) => {
        const y = (sectionY.current[section] ?? 0) + offsetWithinSection;
        // Back off a little so the field's label stays visible above it
        // rather than the input landing flush against the sheet header.
        bodyRef.current?.scrollTo({ y: Math.max(y - 56, 0), animated: true });
    };

    const formattedTime = `${hour}:${String(minute).padStart(2, '0')} ${period}`;
    const activeDays = useMemo(() => DAY_ORDER.filter((day) => days[day]) as DayKey[], [days]);

    const cycleHour = (delta: 1 | -1) => {
        timeTouched.current = true;
        setHour((prev) => {
            const next = prev + delta;
            if (next > 12) return 1;
            if (next < 1) return 12;
            return next;
        });
    };

    const cycleMinute = (delta: 1 | -1) => {
        timeTouched.current = true;
        setMinute((prev) => {
            const next = prev + delta * 5;
            if (next >= 60) return 0;
            if (next < 0) return 55;
            return next;
        });
    };

    const updateItem = (index: number, patch: Partial<MealItem>) =>
        setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));

    const addItem = () => {
        setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
        // The new row is at the bottom of the list — scroll so it is
        // visible rather than leaving the user to hunt for it.
        requestAnimationFrame(() => bodyRef.current?.scrollToEnd({ animated: true }));
    };

    const removeItem = (index: number) =>
        // Always keep one row, so the section never becomes an empty
        // area with no obvious way back.
        setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

    const handleSave = () => {
        if (!name.trim()) {
            setFormError('Give your meal plan a name.');
            return;
        }

        const filledItems = items
            .map((item) => ({
                name: item.name.trim(),
                quantity: item.quantity.trim(),
                unit: item.unit.trim(),
            }))
            .filter((item) => item.name);

        if (filledItems.length === 0) {
            setFormError('Add at least one food item with a name.');
            return;
        }

        // A named item with no amount is allowed — "black coffee" needs
        // no weight — but an amount typed as letters is a slip worth
        // catching before it reaches the database.
        const badQuantity = filledItems.find(
            (item) => item.quantity && Number.isNaN(Number(item.quantity)),
        );
        if (badQuantity) {
            setFormError(`"${badQuantity.name}" has an invalid amount — use numbers only.`);
            return;
        }

        // No day check in log mode — the date is already decided.
        if (!logMode && activeDays.length === 0) {
            setFormError('Pick at least one day for this meal.');
            return;
        }

        setFormError(null);
        onCreate({
            name: name.trim(),
            mealType,
            items: filledItems,
            days: activeDays,
            time: formattedTime,
        });
    };

    return (
        <Modal
      transparent
      visible={isVisible}
      animationType="slide"
      onRequestClose={onClose}
      // Makes the modal window full-screen, so the height measured
      // below and the keyboard height reported by Keyboard events are
      // in the same coordinate space.
      statusBarTranslucent
    >
            <View
                style={styles.overlay}
                onLayout={(event) => setOverlayHeight(event.nativeEvent.layout.height)}
            >
                <Pressable style={styles.backdrop} onPress={onClose} />

                <View style={[styles.sheet, sheetSizing]}>
                    <View style={styles.dragBar}>
                        <View style={styles.dragPill} />
                    </View>

                    <View style={styles.header}>
                        <View style={styles.headerTextWrap}>
                            <View style={styles.headerTitleRow}>
                                <View style={styles.headerIcon}>
                                    <UtensilsCrossed
                                        size={15}
                                        color={colors.secondary}
                                        strokeWidth={2.4}
                                    />
                                </View>
                                <Text style={styles.headerTitle}>
                                    {logMode
                                        ? 'Edit Logged Meal'
                                        : isEditing
                                          ? 'Edit Meal Plan'
                                          : 'New Meal Plan'}
                                </Text>
                            </View>
                            <Text style={styles.headerSubtitle}>
                                {logMode
                                    ? logDateLabel
                                        ? `What you ate on ${logDateLabel}`
                                        : 'What you ate on this day'
                                    : 'Repeats on the days and time you choose'}
                            </Text>
                        </View>
                        <Pressable
                            accessibilityLabel="Close"
                            hitSlop={8}
                            onPress={onClose}
                            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressedDim]}
                        >
                            <X size={18} color={colors.textSecondary} />
                        </Pressable>
                    </View>

                    <ScrollView
                        ref={bodyRef}
                        style={styles.body}
                        contentContainerStyle={[
                            styles.bodyContent,
                            // A little slack while the keyboard is up, so
                            // scrollToField can actually bring the last
                            // rows up rather than hitting the end of the
                            // content and clamping short.
                            { paddingBottom: keyboardHeight > 0 ? 120 : 20 },
                        ]}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Plan name */}
                        <View
                            style={styles.field}
                            onLayout={(event) => {
                                sectionY.current.name = event.nativeEvent.layout.y;
                            }}
                        >
                            <View style={styles.labelRow}>
                                <Text style={styles.labelCaps}>PLAN NAME</Text>
                                <Text style={styles.requiredText}>Required</Text>
                            </View>
                            <TextInput
                                value={name}
                                onChangeText={setName}
                                onFocus={() => scrollToField('name')}
                                placeholder="e.g. High Protein Breakfast"
                                placeholderTextColor={colors.textMuted}
                                style={styles.input}
                            />
                        </View>

                        {/* Meal type */}
                        <View style={styles.field}>
                            <Text style={styles.labelCaps}>MEAL TYPE</Text>
                            <View style={styles.chipWrap}>
                                {MEAL_TYPES.map((type) => {
                                    const selected = type.key === mealType;
                                    return (
                                        <Pressable
                                            key={type.key}
                                            onPress={() => chooseMealType(type.key)}
                                            style={[styles.chip, selected && styles.chipActive]}
                                        >
                                            <Text
                                                style={[
                                                    styles.chipText,
                                                    selected && styles.chipTextActive,
                                                ]}
                                            >
                                                {type.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </View>

                        {/* Food items */}
                        <View
                            style={styles.field}
                            onLayout={(event) => {
                                sectionY.current.items = event.nativeEvent.layout.y;
                            }}
                        >
                            <View style={styles.labelRow}>
                                <Text style={styles.labelCaps}>
                                    FOOD ITEMS ({items.filter((item) => item.name.trim()).length})
                                </Text>
                                <Text style={styles.requiredText}>At least 1</Text>
                            </View>

                            {items.map((item, index) => (
                                <View
                                    key={index}
                                    style={styles.itemRow}
                                    onLayout={(event) => {
                                        itemRowY.current[index] = event.nativeEvent.layout.y;
                                    }}
                                >
                                    <TextInput
                                        value={item.name}
                                        onChangeText={(text) => updateItem(index, { name: text })}
                                        onFocus={() =>
                                            scrollToField('items', itemRowY.current[index] ?? 0)
                                        }
                                        placeholder="Food name"
                                        placeholderTextColor={colors.textMuted}
                                        style={[styles.input, styles.itemName]}
                                    />
                                    <TextInput
                                        value={item.quantity}
                                        onChangeText={(text) =>
                                            updateItem(index, { quantity: text })
                                        }
                                        onFocus={() =>
                                            scrollToField('items', itemRowY.current[index] ?? 0)
                                        }
                                        placeholder="Qty"
                                        placeholderTextColor={colors.textMuted}
                                        keyboardType="numeric"
                                        style={[styles.input, styles.itemQty]}
                                    />
                                    <Pressable
                                        accessibilityLabel={`Unit for item ${index + 1}`}
                                        onPress={() => {
                                            // Dismiss the keyboard first, or the
                                            // picker opens behind it.
                                            Keyboard.dismiss();
                                            setUnitPickerFor(index);
                                        }}
                                        style={styles.unitChip}
                                    >
                                        <Text style={styles.unitText}>{item.unit || 'g'}</Text>
                                        <ChevronDown
                                            size={12}
                                            color={colors.secondary}
                                            strokeWidth={2.6}
                                        />
                                    </Pressable>
                                    <Pressable
                                        accessibilityLabel={`Remove item ${index + 1}`}
                                        disabled={items.length <= 1}
                                        hitSlop={6}
                                        onPress={() => removeItem(index)}
                                        style={[
                                            styles.removeBtn,
                                            items.length <= 1 && styles.removeBtnDisabled,
                                        ]}
                                    >
                                        <Trash2 size={15} color={colors.error} strokeWidth={2.2} />
                                    </Pressable>
                                </View>
                            ))}

                            <Pressable onPress={addItem} style={styles.addItemBtn}>
                                <Plus size={15} color={colors.secondary} strokeWidth={2.6} />
                                <Text style={styles.addItemText}>Add another item</Text>
                            </Pressable>
                        </View>

                        {/* Days — hidden in log mode: a logged meal is one
                            date, not a repeating schedule. */}
                        {logMode ? null : (
                        <View style={styles.field}>
                            <View style={styles.labelRow}>
                                <Text style={styles.labelCaps}>REPEAT ON</Text>
                                <Text style={styles.daysCountText}>
                                    {activeDays.length} {activeDays.length === 1 ? 'DAY' : 'DAYS'}
                                </Text>
                            </View>
                            <View style={styles.dayGrid}>
                                {DAY_ORDER.map((day) => {
                                    const active = days[day];
                                    return (
                                        <Pressable
                                            key={day}
                                            onPress={() =>
                                                setDays((prev) => ({ ...prev, [day]: !prev[day] }))
                                            }
                                            style={[
                                                styles.dayPill,
                                                active ? styles.dayPillActive : styles.dayPillIdle,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.dayPillText,
                                                    active && styles.dayPillTextActive,
                                                ]}
                                            >
                                                {day.slice(0, 3).toUpperCase()}
                                            </Text>
                                            {active ? (
                                                <Check
                                                    size={12}
                                                    strokeWidth={3.5}
                                                    color={colors.white}
                                                    style={styles.dayPillIcon}
                                                />
                                            ) : (
                                                <View style={styles.dayPillDot} />
                                            )}
                                        </Pressable>
                                    );
                                })}
                            </View>
                        </View>
                        )}

                        {/* Time */}
                        <View style={styles.field}>
                            <View style={styles.labelRow}>
                                <Text style={styles.labelCaps}>
                                    {logMode ? 'EATEN AT' : 'MEAL TIME'}
                                </Text>
                                <View style={styles.sameTimeRow}>
                                    <Clock size={12} color={colors.secondary} />
                                    <Text style={styles.sameTimeText}>
                                        {logMode ? 'This day only' : 'Same time every day'}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.timeDial}>
                                <View style={styles.timeClockGroup}>
                                <View style={styles.timeStepper}>
                                    <Pressable
                                        accessibilityLabel="Increase hour"
                                        hitSlop={8}
                                        onPress={() => cycleHour(1)}
                                    >
                                        <ChevronUp size={16} color={colors.textSecondary} />
                                    </Pressable>
                                    <Text style={styles.timeValue}>
                                        {String(hour).padStart(2, '0')}
                                    </Text>
                                    <Pressable
                                        accessibilityLabel="Decrease hour"
                                        hitSlop={8}
                                        onPress={() => cycleHour(-1)}
                                    >
                                        <ChevronDown size={16} color={colors.textSecondary} />
                                    </Pressable>
                                </View>

                                <Text style={styles.timeColon}>:</Text>

                                <View style={styles.timeStepper}>
                                    <Pressable
                                        accessibilityLabel="Increase minutes"
                                        hitSlop={8}
                                        onPress={() => cycleMinute(1)}
                                    >
                                        <ChevronUp size={16} color={colors.textSecondary} />
                                    </Pressable>
                                    <Text style={styles.timeValue}>
                                        {String(minute).padStart(2, '0')}
                                    </Text>
                                    <Pressable
                                        accessibilityLabel="Decrease minutes"
                                        hitSlop={8}
                                        onPress={() => cycleMinute(-1)}
                                    >
                                        <ChevronDown size={16} color={colors.textSecondary} />
                                    </Pressable>
                                </View>
                                </View>

                                <View style={styles.periodWrap}>
                                    {(['AM', 'PM'] as const).map((value) => {
                                        const selected = period === value;
                                        return (
                                            <Pressable
                                                key={value}
                                                onPress={() => {
                                                    timeTouched.current = true;
                                                    setPeriod(value);
                                                }}
                                                style={[
                                                    styles.periodBtn,
                                                    selected && styles.periodBtnActive,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.periodText,
                                                        selected && styles.periodTextActive,
                                                    ]}
                                                >
                                                    {value}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>

                            <Text style={styles.scheduleNote}>
                                {logMode
                                    ? `Logged at ${formattedTime}`
                                    : activeDays.length > 0
                                      ? `Scheduled ${formattedTime} on ${activeDays.join(', ')}`
                                      : 'Pick days above to see the full schedule'}
                            </Text>
                        </View>
                    </ScrollView>

                    <View style={styles.footer}>
                        {formError ? <Text style={styles.formErrorText}>{formError}</Text> : null}

                        <Pressable
                            disabled={saving}
                            onPress={handleSave}
                            style={[styles.cta, saving && styles.ctaDisabled]}
                        >
                            {saving ? (
                                <ActivityIndicator color={colors.white} />
                            ) : (
                                <>
                                    <Text style={styles.ctaText}>
                                        {logMode
                                            ? 'Save Meal Log'
                                            : isEditing
                                              ? 'Save Changes'
                                              : 'Save Meal Plan'}
                                    </Text>
                                    <ArrowRight size={18} strokeWidth={2.6} color={colors.white} />
                                </>
                            )}
                        </Pressable>
                    </View>
                </View>

                {/* Unit picker — an absolutely positioned sibling of the
                    sheet rather than a second Modal. Nested Modals do not
                    reliably present on native, which is why this showed on
                    web only. */}
                {unitPickerFor !== null ? (
                    <Pressable
                        style={styles.pickerOverlay}
                        onPress={() => setUnitPickerFor(null)}
                    >
                            <View style={styles.pickerCard}>
                                <View style={styles.pickerHeader}>
                                    <Text style={styles.pickerTitle}>Measured in</Text>
                                    <Text style={styles.pickerSubtitle}>
                                        How this food item is counted
                                    </Text>
                                </View>

                                <View style={styles.pickerList}>
                                {UNITS.map((unit) => {
                                    const selected = (items[unitPickerFor]?.unit || 'g') === unit;
                                    return (
                                        <Pressable
                                            key={unit}
                                            onPress={() => {
                                                updateItem(unitPickerFor, { unit });
                                                setUnitPickerFor(null);
                                            }}
                                            style={({ pressed }) => [
                                                styles.pickerRow,
                                                selected && styles.pickerRowSelected,
                                                pressed && styles.pickerRowPressed,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.pickerRowText,
                                                    selected && styles.pickerRowTextSelected,
                                                ]}
                                            >
                                                {unit}
                                            </Text>
                                            {selected ? (
                                                <View style={styles.pickerCheck}>
                                                    <Check
                                                        size={12}
                                                        color={colors.white}
                                                        strokeWidth={3.4}
                                                    />
                                                </View>
                                            ) : null}
                                        </Pressable>
                                    );
                                })}
                                </View>
                            </View>
                        </Pressable>
                ) : null}
            </View>
        </Modal>
    );
};

export default NewMealPlanModal;

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(17, 24, 39, 0.5)',
    },
    sheet: {
        width: '100%',
        backgroundColor: colors.surface,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        overflow: 'hidden',
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
        elevation: 16,
    },
    dragBar: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
    dragPill: {
        width: 40,
        height: 4,
        borderRadius: radius.full,
        backgroundColor: withOpacity(colors.textMuted, 0.45),
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        paddingHorizontal: spacing.lg,
        paddingTop: 10,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    headerTextWrap: { flex: 1, gap: 3 },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerIcon: {
        width: 26,
        height: 26,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withOpacity(colors.secondary, 0.14),
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.3,
    },
    headerSubtitle: { fontSize: 12, color: colors.textSecondary },
    closeBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceContainer,
    },
    pressedDim: { opacity: 0.6 },

    body: { flexGrow: 0 },
    bodyContent: {
        paddingHorizontal: spacing.lg,
        paddingTop: 16,
        gap: 22,
    },

    field: { gap: 8 },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    labelCaps: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.8,
        color: colors.textSecondary,
        textTransform: 'uppercase',
    },
    requiredText: { fontSize: 11, fontWeight: '600', color: colors.secondary },
    daysCountText: { fontSize: 11, fontWeight: '800', color: colors.secondary },

    input: {
        height: 44,
        paddingHorizontal: 14,
        fontSize: 14,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceLow,
        color: colors.textPrimary,
        borderWidth: 1.5,
        borderColor: 'transparent',
    },

    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    chip: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: radius.full,
        backgroundColor: colors.surfaceLow,
    },
    chipActive: { backgroundColor: colors.secondary },
    chipText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
    chipTextActive: { color: colors.white },

    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    itemName: { flex: 1 },
    itemQty: { width: 62, textAlign: 'center', paddingHorizontal: 4 },
    unitChip: {
        height: 44,
        minWidth: 58,
        paddingHorizontal: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        borderRadius: radius.md,
        backgroundColor: withOpacity(colors.secondary, 0.14),
    },
    unitText: { fontSize: 12, fontWeight: '800', color: colors.secondary },

    pickerOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
        backgroundColor: 'rgba(17, 24, 39, 0.5)',
    },
    pickerCard: {
        width: '100%',
        maxWidth: 300,
        padding: spacing.md,
        borderRadius: radius.xl,
        backgroundColor: colors.surface,
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.2,
        shadowRadius: 28,
        elevation: 14,
    },
    pickerHeader: {
        gap: 2,
        paddingHorizontal: 4,
        paddingBottom: spacing.sm,
    },
    pickerTitle: {
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: -0.2,
        color: colors.textPrimary,
    },
    pickerSubtitle: {
        fontSize: 12,
        color: colors.textSecondary,
    },
    // Each unit is its own tile rather than a flat list row — the gap is
    // what separates them, so no divider lines are needed.
    pickerList: { gap: 8 },
    pickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 13,
        borderRadius: radius.md,
        // surfaceLow (#F2F3FF) on the card's surface (#FFFFFF) is a
        // 13-point difference in one channel — the tile was there, it
        // just could not be told apart from the card behind it. A
        // stronger fill plus a real border makes each row read as its
        // own target.
        backgroundColor: colors.surfaceContainer,
        borderWidth: 1.5,
        borderColor: colors.border,
    },
    pickerRowSelected: {
        backgroundColor: withOpacity(colors.secondary, 0.12),
        borderColor: colors.secondary,
    },
    pickerRowPressed: { opacity: 0.6 },
    pickerRowText: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.textPrimary,
        textTransform: 'capitalize',
    },
    pickerRowTextSelected: { color: colors.secondary },
    pickerCheck: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.secondary,
    },
    removeBtn: {
        width: 32,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    removeBtnDisabled: { opacity: 0.3 },
    addItemBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 42,
        borderRadius: radius.md,
        backgroundColor: withOpacity(colors.secondary, 0.1),
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: withOpacity(colors.secondary, 0.35),
    },
    addItemText: { fontSize: 13, fontWeight: '800', color: colors.secondary },

    dayGrid: { flexDirection: 'row', gap: 6 },
    dayPill: {
        flex: 1,
        height: 44,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayPillIdle: {
        backgroundColor: colors.surfaceLow,
        borderWidth: 1,
        borderColor: withOpacity(colors.border, 0.6),
    },
    dayPillActive: {
        backgroundColor: colors.secondary,
        shadowColor: colors.secondary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
    },
    dayPillText: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.4,
        lineHeight: 12,
        color: colors.textSecondary,
    },
    dayPillTextActive: { color: colors.white },
    dayPillIcon: { marginTop: 3 },
    dayPillDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginTop: 6,
        // Matches the workout sheet: the previous tint was the same
        // near-white as the tile and never showed.
        backgroundColor: colors.textMuted,
    },

    sameTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    sameTimeText: { fontSize: 11, fontWeight: '600', color: colors.secondary },
    timeDial: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceLow,
    },
    // Takes the space left over by the AM/PM block and centres the
    // digits inside it, so the clock reads as the middle of the dial.
    timeClockGroup: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    timeStepper: { alignItems: 'center', gap: 2 },
    timeValue: {
        fontSize: 22,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.5,
        // Explicit lineHeight + includeFontPadding:false — Android adds
        // asymmetric padding above the glyph otherwise, which makes the
        // digits sit high between the two chevrons.
        lineHeight: 26,
        includeFontPadding: false,
        textAlign: 'center',
        minWidth: 32,
    },
    timeColon: {
        fontSize: 22,
        fontWeight: '800',
        color: colors.textMuted,
        lineHeight: 26,
        includeFontPadding: false,
    },
    periodWrap: { flexDirection: 'row', gap: 6 },
    periodBtn: {
        paddingHorizontal: 13,
        paddingVertical: 8,
        borderRadius: radius.DEFAULT,
        backgroundColor: colors.surface,
    },
    periodBtnActive: { backgroundColor: colors.secondary },
    periodText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
    periodTextActive: { color: colors.white },
    scheduleNote: { fontSize: 11.5, color: colors.textMuted },

    footer: {
        paddingHorizontal: spacing.lg,
        paddingTop: 14,
        paddingBottom: 20,
        gap: 10,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.surface,
    },
    formErrorText: { fontSize: 12.5, fontWeight: '600', color: colors.error },
    cta: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 52,
        borderRadius: radius.md,
        backgroundColor: colors.secondary,
    },
    ctaDisabled: { opacity: 0.6 },
    ctaText: { fontSize: 15, fontWeight: '800', color: colors.white },
});
