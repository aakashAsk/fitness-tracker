// Every grocery list the user has saved — the counterpart to
// MealPlanLibrary, trimmed to what a shopping list actually has: a name,
// items, and whether each item has been picked up. No status, no days,
// no time — a grocery list is not a recurring schedule.
import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Check, ChevronDown, Pencil, ShoppingCart, Trash2 } from 'lucide-react-native';
import { colors, withOpacity } from '../../Theme/colors';
import { spacing } from '../../Theme/spacing';
import {
    deleteGroceryList,
    updateGroceryList,
    GroceryListServiceError,
    type GroceryItem,
    type GroceryList,
} from '../../Services/groceryListService';
import { useGroceryLists, useGroceryListsLoading } from '../../Store/groceryListsSlice';
import { SkeletonBlock, SkeletonGroup } from '../../Components/Skeleton';
import { useDialog } from '../../Components/Dialog';
import { themedStyles } from '../../Theme/ThemeContext';

/** "2/5 picked up" — or "Nothing added" for an empty list, which should
 * not happen (the sheet requires at least one item) but reads sanely if
 * an old/edited list ever gets here empty. */
function describeProgress(items: GroceryItem[]): string {
    if (items.length === 0) return 'Nothing added';
    const checked = items.filter((item) => item.checked).length;
    return `${checked}/${items.length} picked up`;
}

export interface GroceryListLibraryProps {
    onEditList?: (list: GroceryList) => void;
}

export const GroceryListLibrary: React.FC<GroceryListLibraryProps> = ({ onEditList }) => {
    const lists = useGroceryLists();
    const isLoading = useGroceryListsLoading();
    const dialog = useDialog();
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    // Accordion — one list's items open at a time.
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Newest first is already what the store gives (subscribeToGroceryLists
    // sorts server-side); nothing else to order a plain list by.
    const ordered = useMemo(() => lists, [lists]);

    const toggleItem = async (list: GroceryList, index: number) => {
        const nextItems = list.items.map((item, i) =>
            i === index ? { ...item, checked: !item.checked } : item,
        );
        // Applied optimistically via the live subscription's own echo —
        // there is nothing to set locally first, since updateGroceryList
        // firing is what the onSnapshot listener reflects back.
        try {
            await updateGroceryList(list.id, { items: nextItems });
        } catch (error) {
            dialog.show({
                title: 'Could not update list',
                message:
                    error instanceof GroceryListServiceError
                        ? error.message
                        : 'Something went wrong. Please try again.',
            });
        }
    };

    const deleteList = async (list: GroceryList) => {
        setUpdatingId(list.id);
        try {
            await deleteGroceryList(list.id);
        } catch (error) {
            dialog.show({
                title: 'Could not delete list',
                message:
                    error instanceof GroceryListServiceError
                        ? error.message
                        : 'Something went wrong. Please try again.',
            });
        } finally {
            setUpdatingId(null);
        }
    };

    // Deleting is permanent, same rule as the workout/meal plan
    // libraries — always ask first rather than a single-tap delete.
    const confirmDelete = (list: GroceryList) => {
        dialog.show({
            title: 'Delete this list?',
            message: `"${list.name || 'Untitled list'}" will be removed for good. This can't be undone.`,
            actions: [
                { label: 'Cancel', style: 'cancel' },
                { label: 'Delete', style: 'destructive', onPress: () => deleteList(list) },
            ],
        });
    };

    if (!isLoading && ordered.length === 0) return null;

    return (
        <View style={styles.card}>
            <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                    <ShoppingCart size={16} color={colors.primary} strokeWidth={2.4} />
                    <Text style={styles.headerTitle}>Grocery Lists</Text>
                </View>
                <View style={styles.countPill}>
                    <Text style={styles.countText}>{isLoading ? '—' : ordered.length}</Text>
                </View>
            </View>

            {isLoading ? (
                <View style={styles.list}>
                    {[0, 1].map((row) => (
                        <SkeletonGroup key={row} style={styles.row}>
                            <View style={styles.rowHeader}>
                                <SkeletonBlock width={32} height={32} radius={10} />
                                <View style={styles.rowText}>
                                    <SkeletonBlock width="55%" height={11} />
                                    <SkeletonBlock width="35%" height={9} radius={5} />
                                </View>
                            </View>
                        </SkeletonGroup>
                    ))}
                </View>
            ) : (
                <View style={styles.list}>
                    {ordered.map((list, index) => {
                        const isLast = index === ordered.length - 1;
                        const isExpanded = expandedId === list.id;
                        const isBusy = updatingId === list.id;

                        return (
                            <Animated.View
                                key={list.id}
                                layout={LinearTransition.duration(220)}
                                style={[styles.row, !isLast && styles.rowDivider]}
                            >
                                <View style={styles.rowHeader}>
                                    <TouchableOpacity
                                        accessibilityLabel={`${isExpanded ? 'Hide' : 'Show'} items for ${list.name}`}
                                        activeOpacity={0.7}
                                        onPress={() => setExpandedId(isExpanded ? null : list.id)}
                                        style={styles.rowMain}
                                    >
                                        <View style={styles.rowIcon}>
                                            <ShoppingCart size={15} color={colors.primary} strokeWidth={2.3} />
                                        </View>

                                        <View style={styles.rowText}>
                                            <Text style={styles.rowTitle} numberOfLines={1}>
                                                {list.name || 'Untitled list'}
                                            </Text>
                                            <Text style={styles.rowMeta} numberOfLines={1}>
                                                {describeProgress(list.items)}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>

                                    {onEditList ? (
                                        <TouchableOpacity
                                            accessibilityLabel={`Edit ${list.name}`}
                                            activeOpacity={0.7}
                                            hitSlop={6}
                                            onPress={() => onEditList(list)}
                                            style={styles.editButton}
                                        >
                                            <Pencil size={14} color={colors.primary} strokeWidth={2.4} />
                                        </TouchableOpacity>
                                    ) : null}

                                    <TouchableOpacity
                                        accessibilityLabel={`Delete ${list.name}`}
                                        activeOpacity={0.7}
                                        hitSlop={6}
                                        disabled={isBusy}
                                        onPress={() => confirmDelete(list)}
                                        style={[styles.deleteButton, isBusy && styles.actionBusy]}
                                    >
                                        <Trash2 size={14} color={colors.error} strokeWidth={2.4} />
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        accessibilityLabel={`${isExpanded ? 'Hide' : 'Show'} items`}
                                        activeOpacity={0.7}
                                        hitSlop={6}
                                        onPress={() => setExpandedId(isExpanded ? null : list.id)}
                                        style={[styles.chevron, isExpanded && styles.chevronExpanded]}
                                    >
                                        <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2.4} />
                                    </TouchableOpacity>
                                </View>

                                {isExpanded ? (
                                    <Animated.View
                                        entering={FadeIn.duration(160)}
                                        exiting={FadeOut.duration(120)}
                                        style={styles.details}
                                    >
                                        {list.items.map((item, itemIndex) => (
                                            <TouchableOpacity
                                                key={itemIndex}
                                                activeOpacity={0.7}
                                                onPress={() => toggleItem(list, itemIndex)}
                                                style={styles.itemRow}
                                            >
                                                <View
                                                    style={[
                                                        styles.itemCheckbox,
                                                        item.checked && styles.itemCheckboxChecked,
                                                    ]}
                                                >
                                                    {item.checked ? (
                                                        <Check size={12} color={colors.white} strokeWidth={3} />
                                                    ) : null}
                                                </View>
                                                <Text
                                                    style={[
                                                        styles.itemText,
                                                        item.checked && styles.itemTextChecked,
                                                    ]}
                                                    numberOfLines={1}
                                                >
                                                    {item.name}
                                                    {item.quantity || item.unit
                                                        ? ` — ${[item.quantity, item.unit].filter(Boolean).join(' ')}`
                                                        : ''}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </Animated.View>
                                ) : null}
                            </Animated.View>
                        );
                    })}
                </View>
            )}
        </View>
    );
};

export default GroceryListLibrary;

const styles = themedStyles(() => ({
    card: {
        backgroundColor: colors.surface,
        borderRadius: 24,
        padding: 16,
        marginHorizontal: spacing.screenHorizontalPadding,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.07,
        shadowRadius: 18,
        elevation: 3,
        gap: 12,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
    },
    headerTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.textPrimary,
        letterSpacing: -0.2,
    },
    countPill: {
        backgroundColor: withOpacity(colors.primary, 0.14),
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: 12,
    },
    countText: {
        fontSize: 10.5,
        fontWeight: '800',
        color: colors.primary,
    },
    list: {
        gap: 2,
    },
    row: {
        paddingVertical: 9,
    },
    rowDivider: {
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    rowHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    rowMain: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    rowIcon: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withOpacity(colors.primary, 0.12),
    },
    rowText: {
        flex: 1,
        gap: 1,
    },
    rowTitle: {
        fontSize: 13.5,
        fontWeight: '700',
        color: colors.textPrimary,
    },
    rowMeta: {
        fontSize: 11,
        color: colors.textSecondary,
    },
    editButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withOpacity(colors.primary, 0.12),
    },
    deleteButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withOpacity(colors.error, 0.12),
    },
    actionBusy: {
        opacity: 0.5,
    },
    chevron: {
        width: 20,
        alignItems: 'center',
    },
    chevronExpanded: {
        transform: [{ rotate: '180deg' }],
    },
    details: {
        gap: 6,
        paddingTop: 11,
        paddingLeft: 42,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        paddingVertical: 3,
    },
    itemCheckbox: {
        width: 20,
        height: 20,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: withOpacity(colors.primary, 0.4),
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemCheckboxChecked: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    itemText: {
        flex: 1,
        fontSize: 12.5,
        color: colors.textPrimary,
    },
    itemTextChecked: {
        color: colors.textMuted,
        textDecorationLine: 'line-through',
    },
}));
