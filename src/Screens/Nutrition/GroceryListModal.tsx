// The "Add Groceries List" sheet — deliberately the same structure as
// NewMealPlanModal's item rows (name, quantity, a unit picker, "Add
// another item"), trimmed to just a list name and its items: a grocery
// list has no meal type, no repeat schedule and no time slot the way a
// meal plan does.
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Keyboard,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from 'react-native';
import { ArrowRight, Check, ChevronDown, Plus, ShoppingCart, Trash2, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, withOpacity } from '../../Theme/colors';
import { radius, spacing } from '../../Theme/spacing';
import type { GroceryItem, GroceryListInput } from '../../Services/groceryListService';
import { themedStyles } from '../../Theme/ThemeContext';

interface GroceryListModalProps {
    onClose: () => void;
    onCreate: (payload: GroceryListInput) => void;
    saving?: boolean;
}

const EMPTY_ITEM: GroceryItem = { name: '', quantity: '', unit: 'g' };
/** Same unit set as NewMealPlanModal, kept as its own local copy rather
 * than a shared import — the two sheets are independent enough (a
 * grocery item is not a MealItem) that coupling them for one constant
 * would cost more than it saves. */
const UNITS = ['g', 'ml', 'piece', 'scoop', 'cup', 'tbsp', 'tsp', 'pack', 'dozen'];

export const GroceryListModal: React.FC<GroceryListModalProps> = ({
    onClose,
    onCreate,
    saving = false,
}) => {
    // Mounted only while open, so Modal would start life already visible
    // and skip its slide-in. Flipping on the next frame gives it the
    // false -> true transition it animates on.
    const [isVisible, setIsVisible] = useState(false);
    useEffect(() => {
        const frame = requestAnimationFrame(() => setIsVisible(true));
        return () => cancelAnimationFrame(frame);
    }, []);

    const [name, setName] = useState('');
    const [items, setItems] = useState<GroceryItem[]>([{ ...EMPTY_ITEM }]);
    const [formError, setFormError] = useState<string | null>(null);
    /** Index of the item row whose unit picker is open, or null. */
    const [unitPickerFor, setUnitPickerFor] = useState<number | null>(null);

    // Same approach as the meal/workout sheets: KeyboardAvoidingView
    // measures unreliably inside a Modal on Android, so the inset is
    // applied by hand from the keyboard events.
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

    const [overlayHeight, setOverlayHeight] = useState(0);
    const insets = useSafeAreaInsets();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();

    const sheetSizing =
        overlayHeight > 0
            ? {
                  marginBottom: keyboardHeight,
                  maxHeight: Math.max(overlayHeight - keyboardHeight - insets.top - 24, 220),
              }
            : undefined;

    const bodyRef = useRef<ScrollView>(null);
    const itemRowY = useRef<Record<number, number>>({});

    const scrollToItem = (index: number) => {
        const y = itemRowY.current[index] ?? 0;
        bodyRef.current?.scrollTo({ y: Math.max(y - 56, 0), animated: true });
    };

    const updateItem = (index: number, patch: Partial<GroceryItem>) =>
        setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));

    const addItem = () => {
        setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
        requestAnimationFrame(() => bodyRef.current?.scrollToEnd({ animated: true }));
    };

    const removeItem = (index: number) =>
        // Always keep one row, so the section never becomes an empty
        // area with no obvious way back.
        setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

    const handleSave = () => {
        if (!name.trim()) {
            setFormError('Give your grocery list a name.');
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
            setFormError('Add at least one item with a name.');
            return;
        }

        const badQuantity = filledItems.find(
            (item) => item.quantity && Number.isNaN(Number(item.quantity)),
        );
        if (badQuantity) {
            setFormError(`"${badQuantity.name}" has an invalid amount — use numbers only.`);
            return;
        }

        setFormError(null);
        onCreate({ name: name.trim(), items: filledItems });
    };

    return (
        <Modal
            transparent
            visible={isVisible}
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent
            navigationBarTranslucent
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
                                    <ShoppingCart size={15} color={colors.primary} strokeWidth={2.4} />
                                </View>
                                <Text style={styles.headerTitle}>New Grocery List</Text>
                            </View>
                            <Text style={styles.headerSubtitle}>What you need to pick up</Text>
                        </View>
                        <Pressable
                            accessibilityLabel="Close"
                            hitSlop={8}
                            onPress={onClose}
                            style={styles.closeBtn}
                        >
                            <X size={18} color={colors.textSecondary} />
                        </Pressable>
                    </View>

                    <ScrollView
                        ref={bodyRef}
                        style={styles.body}
                        contentContainerStyle={[
                            styles.bodyContent,
                            { paddingBottom: keyboardHeight > 0 ? 120 : 20 },
                        ]}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        {/* List name */}
                        <View style={styles.field}>
                            <View style={styles.labelRow}>
                                <Text style={styles.labelCaps}>LIST NAME</Text>
                                <Text style={styles.requiredText}>Required</Text>
                            </View>
                            <TextInput
                                value={name}
                                onChangeText={setName}
                                placeholder="e.g. Weekly Groceries"
                                placeholderTextColor={colors.textMuted}
                                style={styles.input}
                            />
                        </View>

                        {/* Items */}
                        <View style={styles.field}>
                            <View style={styles.labelRow}>
                                <Text style={styles.labelCaps}>
                                    ITEMS ({items.filter((item) => item.name.trim()).length})
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
                                        onFocus={() => scrollToItem(index)}
                                        placeholder={index === 0 ? 'e.g. Eggs' : 'Item name'}
                                        placeholderTextColor={colors.textMuted}
                                        style={[styles.input, styles.itemName]}
                                    />
                                    <TextInput
                                        value={item.quantity}
                                        onChangeText={(text) => updateItem(index, { quantity: text })}
                                        onFocus={() => scrollToItem(index)}
                                        placeholder="Qty"
                                        placeholderTextColor={colors.textMuted}
                                        keyboardType="numeric"
                                        style={[styles.input, styles.itemQty]}
                                    />
                                    <Pressable
                                        accessibilityLabel={`Unit for item ${index + 1}`}
                                        onPress={() => {
                                            // Dismiss the keyboard first, or
                                            // the picker opens behind it.
                                            Keyboard.dismiss();
                                            setUnitPickerFor(index);
                                        }}
                                        style={styles.unitChip}
                                    >
                                        <Text style={styles.unitText}>{item.unit || 'g'}</Text>
                                        <ChevronDown size={12} color={colors.primary} strokeWidth={2.6} />
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
                                <Plus size={15} color={colors.primary} strokeWidth={2.6} />
                                <Text style={styles.addItemText}>Add another item</Text>
                            </Pressable>
                        </View>
                    </ScrollView>

                    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
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
                                    <Text style={styles.ctaText}>Save Grocery List</Text>
                                    <ArrowRight size={18} strokeWidth={2.6} color={colors.white} />
                                </>
                            )}
                        </Pressable>
                    </View>
                </View>

                {/* Unit picker — an absolutely positioned sibling of the
                    sheet rather than a second Modal, same as the meal
                    sheet: nested Modals do not reliably present on native. */}
                {unitPickerFor !== null ? (
                    <Pressable
                        style={[styles.pickerOverlay, { width: windowWidth, height: windowHeight }]}
                        onPress={() => setUnitPickerFor(null)}
                    >
                        <View style={styles.pickerCard}>
                            <View style={styles.pickerHeader}>
                                <Text style={styles.pickerTitle}>Measured in</Text>
                                <Text style={styles.pickerSubtitle}>How this item is counted</Text>
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
                                            style={[
                                                styles.pickerRow,
                                                selected && styles.pickerRowSelected,
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
                                                    <Check size={12} color={colors.white} strokeWidth={3.4} />
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

export default GroceryListModal;

const styles = themedStyles(() => ({
    footer: {
        paddingHorizontal: spacing.lg,
        paddingTop: 14,
        paddingBottom: 20,
        gap: 10,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.surface,
    },
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
        backgroundColor: withOpacity(colors.primary, 0.14),
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
    requiredText: { fontSize: 11, fontWeight: '600', color: colors.primary },

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
        backgroundColor: withOpacity(colors.primary, 0.14),
    },
    unitText: { fontSize: 12, fontWeight: '800', color: colors.primary },

    pickerOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
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
    pickerList: { gap: 8 },
    pickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 13,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceContainer,
        borderWidth: 1.5,
        borderColor: colors.border,
    },
    pickerRowSelected: {
        backgroundColor: withOpacity(colors.primary, 0.12),
        borderColor: colors.primary,
    },
    pickerRowText: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.textPrimary,
        textTransform: 'capitalize',
    },
    pickerRowTextSelected: { color: colors.primary },
    pickerCheck: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
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
        backgroundColor: withOpacity(colors.primary, 0.1),
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: withOpacity(colors.primary, 0.35),
    },
    addItemText: { fontSize: 13, fontWeight: '800', color: colors.primary },

    formErrorText: { fontSize: 12.5, fontWeight: '600', color: colors.error },
    cta: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 52,
        borderRadius: radius.md,
        backgroundColor: colors.primary,
    },
    ctaDisabled: { opacity: 0.6 },
    ctaText: { fontSize: 15, fontWeight: '800', color: colors.white },
}));
