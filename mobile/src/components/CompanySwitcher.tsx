import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCompany } from '../context/CompanyContext';
import { Colors, FontSize, FontWeight, Radii, Spacing } from '../theme';

export function CompanySwitcher() {
  const { companies, selectedCompany, setSelectedCompanyId } = useCompany();
  const [visible, setVisible] = useState(false);

  if (!selectedCompany) return null;

  const initials = selectedCompany.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setVisible(true)}
        activeOpacity={0.75}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.companyName} numberOfLines={1}>
          {selectedCompany.name}
        </Text>
        <Text style={styles.chevron}>{'v'}</Text>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Switch Company</Text>
            <ScrollView>
              {companies.map((company) => {
                const isSelected = company.id === selectedCompany.id;
                const ci = company.name
                  .split(' ')
                  .map((w) => w[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);

                return (
                  <TouchableOpacity
                    key={company.id}
                    style={[styles.row, isSelected && styles.rowSelected]}
                    onPress={async () => {
                      await setSelectedCompanyId(company.id);
                      setVisible(false);
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.rowAvatar, isSelected && styles.rowAvatarSelected]}>
                      <Text style={[styles.rowAvatarText, isSelected && styles.rowAvatarTextSelected]}>
                        {ci}
                      </Text>
                    </View>
                    <Text style={[styles.rowName, isSelected && styles.rowNameSelected]}>
                      {company.name}
                    </Text>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radii.input,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    maxWidth: 220,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.bg,
  },
  companyName: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textPrimary,
  },
  chevron: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    maxHeight: 400,
  },
  sheetTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.input,
  },
  rowSelected: {
    backgroundColor: `${Colors.primary}18`,
  },
  rowAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowAvatarSelected: {
    backgroundColor: Colors.primary,
  },
  rowAvatarText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
  },
  rowAvatarTextSelected: {
    color: Colors.bg,
  },
  rowName: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
  },
  rowNameSelected: {
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  checkmark: {
    fontSize: FontSize.base,
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
});
