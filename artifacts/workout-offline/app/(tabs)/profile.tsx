import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useWorkout } from '@/context/WorkoutContext';
import { ScreenHeader, SectionTitle, SecondaryButton, PrimaryButton } from '@/components/WorkoutUI';
import { exerciseCatalog } from '@/domain/workout';
import { createWorkoutBackup, parseWorkoutBackup } from '@/domain/backup';

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const workout = useWorkout();
  const [name, setName] = useState(workout.profileName);
  const [editing, setEditing] = useState(false);
  const [customExerciseName, setCustomExerciseName] = useState('');
  const [customExerciseGroup, setCustomExerciseGroup] = useState('Petto');
  const [backupBusy, setBackupBusy] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<ReturnType<typeof parseWorkoutBackup> | null>(null);
  const groups = useMemo(
    () => Array.from(new Set(exerciseCatalog.map((exercise) => exercise.group))),
    [],
  );
  const addCustomExercise = () => {
    const cleanName = customExerciseName.trim();
    if (!cleanName) {
      Alert.alert('Nome mancante', 'Inserisci il nome dell’esercizio.');
      return;
    }
    if (exerciseCatalog.some((exercise) => exercise.name.trim().toLocaleLowerCase() === cleanName.toLocaleLowerCase())) {
      Alert.alert('Nome già nel catalogo', 'Questo esercizio è già disponibile nel catalogo standard.');
      return;
    }
    if (!workout.addCustomExercise(cleanName, customExerciseGroup)) {
      Alert.alert('Esercizio già presente', 'Scegli un nome diverso: il catalogo contiene già un esercizio con questo nome.');
      return;
    }
    setCustomExerciseName('');
  };
  const exportBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const json = JSON.stringify(createWorkoutBackup(workout.getBackupState()), null, 2);
      const fileName = `workout-offline-backup-${workout.today}-${Date.now()}.json`;
      if (Platform.OS === 'web') {
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const file = new File(Paths.cache, fileName);
        file.create();
        file.write(json);
        if (!(await Sharing.isAvailableAsync())) {
          throw new Error('La condivisione file non è disponibile su questo dispositivo.');
        }
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Esporta backup Workout Offline',
          UTI: 'public.json',
        });
      }
    } catch (error) {
      Alert.alert(
        'Esportazione non riuscita',
        error instanceof Error ? error.message : 'Riprova tra qualche istante.',
      );
    } finally {
      setBackupBusy(false);
    }
  };
  const selectBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const json = asset.file
        ? await asset.file.text()
        : await new File(asset.uri).text();
      setPendingBackup(parseWorkoutBackup(json));
    } catch (error) {
      Alert.alert(
        'Importazione non riuscita',
        error instanceof Error ? error.message : 'Controlla il file e riprova.',
      );
    } finally {
      setBackupBusy(false);
    }
  };
  const importBackup = async () => {
    if (!pendingBackup || backupBusy) return;
    setBackupBusy(true);
    try {
      await workout.restoreBackup(pendingBackup);
      setName(pendingBackup.profileName);
      setPendingBackup(null);
      Alert.alert('Ripristino completato', 'Tutti i dati del backup sono stati ripristinati su questo dispositivo.');
    } catch (error) {
      Alert.alert(
        'Ripristino non riuscito',
        error instanceof Error ? error.message : 'I dati attuali non sono stati sostituiti. Riprova.',
      );
    } finally {
      setBackupBusy(false);
    }
  };
  return <View style={[page.root, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={[page.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 110 }]} showsVerticalScrollIndicator={false}>
    <ScreenHeader eyebrow="Solo sul tuo dispositivo" title="Profilo" />
    <View style={[page.identity, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[page.avatar, { backgroundColor: colors.primary }]}><Text style={[page.avatarText, { color: colors.primaryForeground }]}>{(workout.profileName || 'IO').slice(0, 2).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={[page.identityName, { color: colors.foreground }]}>{workout.profileName || 'Il tuo profilo'}</Text><Text style={[page.identityMeta, { color: colors.mutedForeground }]}>Nessun account · dati locali</Text></View><Pressable hitSlop={8} onPress={() => setEditing(!editing)} style={[page.editButton, { backgroundColor: colors.surface2 }]}><Feather name="edit-2" size={16} color={colors.foreground} /></Pressable></View>
    {editing ? <View style={page.editBox}><TextInput value={name} onChangeText={setName} placeholder="Come ti chiami?" placeholderTextColor={colors.mutedForeground} style={[page.nameInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} /><PrimaryButton label="Salva nome" onPress={() => { workout.setProfileName(name.trim()); setEditing(false); }} /></View> : null}
    <SectionTitle title="Preferenze" />
    <View style={[page.settingsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <SettingRow icon="moon" title="Tema" value={workout.theme === 'dark' ? 'Scuro' : workout.theme === 'light' ? 'Chiaro' : 'Sistema'} colors={colors} onPress={() => workout.setTheme(workout.theme === 'dark' ? 'light' : 'dark')} />
      <View style={[page.separator, { backgroundColor: colors.border }]} />
      <SettingRow icon="sliders" title="Unità di misura" value={workout.unit.toUpperCase()} colors={colors} onPress={() => workout.setUnit(workout.unit === 'kg' ? 'lb' : 'kg')} />
    </View>
    <SectionTitle title="I tuoi esercizi" action={<Text style={[page.customCount, { color: colors.mutedForeground }]}>{workout.customExercises.length}</Text>} />
    <View style={[page.customCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[page.customIntro, { color: colors.mutedForeground }]}>Crea il tuo esercizio una volta: sarà disponibile nel catalogo quando prepari un programma.</Text>
      <TextInput
        testID="profile-custom-exercise-name"
        value={customExerciseName}
        onChangeText={setCustomExerciseName}
        placeholder="Nome, es. Pull-over ai cavi"
        placeholderTextColor={colors.mutedForeground}
        returnKeyType="done"
        onSubmitEditing={addCustomExercise}
        style={[page.nameInput, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.foreground }]}
      />
      <Text style={[page.groupLabel, { color: colors.foreground }]}>Gruppo muscolare</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={page.groupOptions}>
        {groups.map((group) => (
          <Pressable
            key={group}
            testID={`profile-custom-group-${group}`}
            accessibilityRole="button"
            accessibilityState={{ selected: customExerciseGroup === group }}
            onPress={() => setCustomExerciseGroup(group)}
            style={[page.groupOption, { backgroundColor: customExerciseGroup === group ? colors.accent : colors.surface2, borderColor: customExerciseGroup === group ? colors.primary : colors.border }]}
          >
            <Text style={[page.groupOptionText, { color: customExerciseGroup === group ? colors.primary : colors.mutedForeground }]}>{group}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <PrimaryButton label="Aggiungi al catalogo" icon="plus" onPress={addCustomExercise} />
      {workout.customExercises.length ? (
        <View style={[page.customList, { borderTopColor: colors.border }]}>
          {workout.customExercises.map((exercise) => (
            <View key={exercise.id} style={page.customRow}>
              <View style={[page.customExerciseIcon, { backgroundColor: colors.accent }]}>
                <Feather name="activity" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[page.customExerciseName, { color: colors.foreground }]}>{exercise.name}</Text>
                <Text style={[page.customExerciseGroup, { color: colors.mutedForeground }]}>{exercise.group}</Text>
              </View>
              <Pressable
                testID={`remove-custom-exercise-${exercise.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Rimuovi ${exercise.name} dal catalogo`}
                hitSlop={10}
                onPress={() => Alert.alert('Rimuovere dal catalogo?', `${exercise.name} non sarà più selezionabile nei nuovi programmi. Gli allenamenti già salvati resteranno invariati.`, [
                  { text: 'Annulla', style: 'cancel' },
                  { text: 'Rimuovi', style: 'destructive', onPress: () => workout.removeCustomExercise(exercise.id) },
                ])}
              >
                <Feather name="trash-2" size={16} color={colors.destructive} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
    <SectionTitle title="Il tuo percorso" />
    <View style={page.metrics}><Metric label="Allenamenti" value={`${workout.logs.length}`} colors={colors} /><Metric label="Cicli chiusi" value={`${workout.history.length}`} colors={colors} /><Metric label="Record streak" value={`${workout.record}`} colors={colors} /></View>
    <SectionTitle title="Informazioni" />
    <View style={[page.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}><InfoRow icon="shield" text="Nessun login, nessun cloud, nessun tracking" colors={colors} /><InfoRow icon="database" text="I tuoi allenamenti restano su questo dispositivo" colors={colors} /><InfoRow icon="info" text="Workout Offline · versione 1.0" colors={colors} /></View>
    <SectionTitle title="Backup e ripristino" />
    <View style={[page.backupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={page.backupHeading}>
        <View style={[page.backupIcon, { backgroundColor: colors.accent }]}><Feather name="archive" size={17} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[page.backupTitle, { color: colors.foreground }]}>Una copia completa dei tuoi dati</Text>
          <Text style={[page.backupDescription, { color: colors.mutedForeground }]}>Programmi e date, sessioni e serie, XP, storico, esercizi personalizzati e preferenze.</Text>
        </View>
      </View>
      <PrimaryButton
        label={backupBusy ? 'Attendi…' : 'Esporta tutti i dati'}
        icon="download"
        onPress={() => { void exportBackup(); }}
        disabled={backupBusy}
      />
      <Pressable
        testID="import-workout-backup"
        accessibilityRole="button"
        disabled={backupBusy}
        onPress={() => { void selectBackup(); }}
        style={({ pressed }) => [
          page.backupImportButton,
          { borderColor: colors.border, opacity: backupBusy ? 0.5 : pressed ? 0.68 : 1 },
        ]}
      >
        {backupBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="upload" size={16} color={colors.foreground} />}
        <Text style={[page.backupImportText, { color: colors.foreground }]}>Importa un backup</Text>
      </Pressable>
      <View style={[page.backupNotice, { backgroundColor: colors.surface2 }]}>
        <Feather name="info" size={14} color={colors.primary} />
        <Text style={[page.backupNoticeText, { color: colors.mutedForeground }]}>Il backup è un file JSON salvato o condiviso da te; non viene inviato automaticamente a nessun servizio.</Text>
      </View>
    </View>
    <SecondaryButton label="Azzera nome profilo" onPress={() => Alert.alert('Rimuovere il nome?', 'Il resto dei tuoi allenamenti resterà intatto.', [{ text: 'Annulla', style: 'cancel' }, { text: 'Rimuovi', style: 'destructive', onPress: workout.clearProfile }])} />
  </ScrollView>
  <Modal visible={pendingBackup !== null} transparent animationType="fade" onRequestClose={() => setPendingBackup(null)}>
    <View style={[page.backupModalOverlay, { backgroundColor: `${colors.background}D9` }]}>
      <View style={[page.backupConfirmCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[page.backupWarningIcon, { backgroundColor: `${colors.destructive}18` }]}><Feather name="alert-triangle" size={21} color={colors.destructive} /></View>
        <Text style={[page.backupConfirmTitle, { color: colors.foreground }]}>Sostituire i dati attuali?</Text>
        <Text style={[page.backupConfirmCopy, { color: colors.mutedForeground }]}>
          Il backup contiene {pendingBackup?.programs.length ?? 0} programmi, {pendingBackup?.logs.length ?? 0} sessioni completate e {pendingBackup?.customExercises.length ?? 0} esercizi personalizzati.
        </Text>
        <Text style={[page.backupConfirmWarning, { color: colors.foreground }]}>
          Importandolo, tutti i dati presenti ora su questo dispositivo verranno sostituiti. L’operazione non si può annullare: esporta prima un backup attuale se vuoi conservarli.
        </Text>
        <Pressable
          testID="confirm-workout-backup-import"
          accessibilityRole="button"
          disabled={backupBusy}
          onPress={() => { void importBackup(); }}
          style={({ pressed }) => [page.backupReplaceButton, { backgroundColor: colors.destructive, opacity: backupBusy ? 0.6 : pressed ? 0.78 : 1 }]}
        >
          {backupBusy ? <ActivityIndicator size="small" color={colors.destructiveForeground} /> : null}
          <Text style={[page.backupReplaceText, { color: colors.destructiveForeground }]}>{backupBusy ? 'Ripristino…' : 'Sostituisci con il backup'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={backupBusy}
          onPress={() => setPendingBackup(null)}
          style={({ pressed }) => [page.backupCancelButton, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[page.backupCancelText, { color: colors.foreground }]}>Annulla</Text>
        </Pressable>
      </View>
    </View>
  </Modal>
  </View>;
}

function SettingRow({ icon, title, value, colors, onPress }: { icon: keyof typeof Feather.glyphMap; title: string; value: string; colors: ReturnType<typeof useColors>; onPress: () => void }) { return <Pressable onPress={onPress} style={page.settingRow}><View style={[page.settingIcon, { backgroundColor: colors.accent }]}><Feather name={icon} size={16} color={colors.primary} /></View><Text style={[page.settingTitle, { color: colors.foreground }]}>{title}</Text><Text style={[page.settingValue, { color: colors.mutedForeground }]}>{value}</Text><Feather name="chevron-right" size={17} color={colors.mutedForeground} /></Pressable>; }
function InfoRow({ icon, text, colors }: { icon: keyof typeof Feather.glyphMap; text: string; colors: ReturnType<typeof useColors> }) { return <View style={page.infoRow}><Feather name={icon} size={16} color={colors.mutedForeground} /><Text style={[page.infoText, { color: colors.mutedForeground }]}>{text}</Text></View>; }
function Metric({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) { return <View style={[page.metric, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[page.metricValue, { color: colors.foreground }]}>{value}</Text><Text style={[page.metricLabel, { color: colors.mutedForeground }]}>{label}</Text></View>; }
const page = StyleSheet.create({ root: { flex: 1 }, content: { paddingHorizontal: 18 }, identity: { borderRadius: 22, borderWidth: 1, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 54, height: 54, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 18, fontWeight: '900' }, identityName: { fontSize: 17, fontWeight: '900' }, identityMeta: { fontSize: 12, marginTop: 4 }, editButton: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, editBox: { marginTop: 10, gap: 10 }, nameInput: { borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, minHeight: 48, fontSize: 15 }, settingsCard: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 14 }, settingRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11 }, settingIcon: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, settingTitle: { flex: 1, fontSize: 14, fontWeight: '800' }, settingValue: { fontSize: 13, fontWeight: '700' }, separator: { height: 1 }, customCount: { fontSize: 12, fontWeight: '800' }, customCard: { borderWidth: 1, borderRadius: 22, padding: 15, gap: 12 }, customIntro: { fontSize: 12, lineHeight: 17 }, groupLabel: { fontSize: 12, fontWeight: '800', marginBottom: -5 }, groupOptions: { flexDirection: 'row', gap: 7, paddingBottom: 2 }, groupOption: { borderRadius: 99, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 }, groupOptionText: { fontSize: 11, fontWeight: '800' }, customList: { borderTopWidth: 1, paddingTop: 4 }, customRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 57 }, customExerciseIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, customExerciseName: { fontSize: 13, fontWeight: '800' }, customExerciseGroup: { fontSize: 11, marginTop: 3 }, metrics: { flexDirection: 'row', gap: 8 }, metric: { flex: 1, borderRadius: 18, borderWidth: 1, padding: 14 }, metricValue: { fontSize: 24, fontWeight: '900' }, metricLabel: { fontSize: 10, marginTop: 5 }, infoCard: { borderWidth: 1, borderRadius: 22, padding: 17, gap: 16, marginBottom: 14 }, infoRow: { flexDirection: 'row', gap: 10, alignItems: 'center' }, infoText: { flex: 1, fontSize: 13, lineHeight: 18 }, backupCard: { borderWidth: 1, borderRadius: 22, padding: 15, gap: 12 }, backupHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 2 }, backupIcon: { width: 37, height: 37, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, backupTitle: { fontSize: 14, lineHeight: 19, fontWeight: '900' }, backupDescription: { fontSize: 11, lineHeight: 16, marginTop: 3 }, backupImportButton: { minHeight: 48, borderWidth: 1, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, backupImportText: { fontSize: 13, fontWeight: '800' }, backupNotice: { borderRadius: 13, padding: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 7 }, backupNoticeText: { flex: 1, fontSize: 10, lineHeight: 15 }, backupModalOverlay: { flex: 1, justifyContent: 'center', padding: 20 }, backupConfirmCard: { borderWidth: 1, borderRadius: 23, padding: 19 }, backupWarningIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }, backupConfirmTitle: { fontSize: 19, fontWeight: '900' }, backupConfirmCopy: { fontSize: 12, lineHeight: 18, marginTop: 8 }, backupConfirmWarning: { fontSize: 12, lineHeight: 18, marginTop: 12, fontWeight: '700' }, backupReplaceButton: { minHeight: 48, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 10, marginTop: 16 }, backupReplaceText: { fontSize: 13, fontWeight: '900' }, backupCancelButton: { minHeight: 46, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, backupCancelText: { fontSize: 13, fontWeight: '800' }, });