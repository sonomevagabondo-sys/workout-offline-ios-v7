import React, { useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { createProgram, DayType, daysBetween, Exercise, exerciseCatalog, formatItalianDate, formatItalianDateLong, fromIsoDate, Program, toIsoDate } from '@/domain/workout';
import { useWorkout } from '@/context/WorkoutContext';
import { PrimaryButton, SecondaryButton } from '@/components/WorkoutUI';

type PendingExercise = {
  id?: string;
  name: string;
  group: string;
  defaultSets: string;
  defaultReps: string;
  custom: boolean;
};

export default function ProgramsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const workout = useWorkout();
  const scrollRef = useRef<ScrollView>(null);
  const editorOffset = useRef(0);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(workout.today);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => fromIsoDate(workout.today));
  const [types, setTypes] = useState<DayType[]>(['Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest']);
  const [dayNames, setDayNames] = useState<string[]>(Array.from({ length: 7 }, () => ''));
  const [selected, setSelected] = useState<Record<number, Exercise[]>>({});
  const [editedDayIndices, setEditedDayIndices] = useState<number[]>([]);
  const [dayIndex, setDayIndex] = useState(0);
  const [pending, setPending] = useState<PendingExercise | null>(null);
  const [exerciseName, setExerciseName] = useState('');
  const [targetSets, setTargetSets] = useState('');
  const [targetReps, setTargetReps] = useState('');
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const groups = useMemo(
    () => Array.from(new Set([
      ...exerciseCatalog.map((exercise) => exercise.group),
      ...workout.customExercises.map((exercise) => exercise.group),
    ])),
    [workout.customExercises],
  );
  const savedCustomCatalog = useMemo(
    () => workout.customExercises.map((exercise) => ({
      name: exercise.name,
      group: exercise.group,
      sets: 3,
      reps: 10,
      custom: true,
    })),
    [workout.customExercises],
  );
  const [customGroup, setCustomGroup] = useState(groups[0] ?? 'Petto');
  const editingProgram = workout.programs.find((program) => program.id === editingProgramId);
  const editingElapsedDays = editingProgram ? daysBetween(editingProgram.cycleStart, workout.today) : 0;
  const editingActiveToday = Boolean(
    editingProgram &&
    editingProgram.id === workout.activeProgramId &&
    editingElapsedDays >= 0 &&
    editingElapsedDays < 7,
  );
  const editingActiveTodaySaved = Boolean(
    editingActiveToday &&
    editingProgram?.days[editingElapsedDays]?.completed,
  );
  const currentExercises = selected[dayIndex] ?? [];

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;
    const dayCount = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: offset + dayCount }, (_, cellIndex) => {
      if (cellIndex < offset) return null;
      const day = cellIndex - offset + 1;
      const date = toIsoDate(new Date(year, month, day));
      return { date, day, disabled: date < workout.today, selected: date === startDate };
    });
  }, [calendarMonth, startDate, workout.today]);
  const currentMonth = fromIsoDate(workout.today);
  const calendarMonthTitle = calendarMonth.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const formattedCalendarMonthTitle =
    calendarMonthTitle.charAt(0).toLocaleUpperCase('it-IT') + calendarMonthTitle.slice(1);
  const canShowPreviousMonth =
    calendarMonth.getFullYear() > currentMonth.getFullYear() ||
    (calendarMonth.getFullYear() === currentMonth.getFullYear() && calendarMonth.getMonth() > currentMonth.getMonth());

  const markDayEdited = (index: number) => {
    setEditedDayIndices((current) => current.includes(index) ? current : [...current, index]);
  };

  const setDayType = (index: number, type: DayType) => {
    if (types[index] === type) return;
    markDayEdited(index);
    setTypes((current) => current.map((item, itemIndex) => (itemIndex === index ? type : item)));
  };

  const setDayName = (index: number, value: string) => {
    markDayEdited(index);
    setDayNames((current) => current.map((currentName, nameIndex) => nameIndex === index ? value : currentName));
  };

  const resetEditor = () => {
    setEditingProgramId(null);
    setName('');
    setStartDate(workout.today);
    setDatePickerVisible(false);
    setTypes(['Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest', 'Rest']);
    setDayNames(Array.from({ length: 7 }, () => ''));
    setSelected({});
    setEditedDayIndices([]);
    setDayIndex(0);
  };

  const editSavedProgram = (program: Program) => {
    const elapsedDays = daysBetween(program.cycleStart, workout.today);
    const editableStart = elapsedDays < 0 || elapsedDays >= 7 ? 0 : elapsedDays;
    const plannedDays = program.nextCycleDays ?? program.days;
    const sourceDays = plannedDays.map((plannedDay, index) => {
      const liveDay = program.days[index];
      if (!liveDay) return plannedDay;
      if (program.id === workout.activeProgramId && elapsedDays < 7 && index === elapsedDays) {
        return liveDay;
      }
      if (elapsedDays >= 6 || (index < elapsedDays && program.nextCycleDays)) {
        return {
          ...plannedDay,
          completed: liveDay.completed,
          skipped: liveDay.skipped,
          completedOn: liveDay.completedOn,
        };
      }
      return liveDay;
    });
    setEditingProgramId(program.id);
    setEditedDayIndices([]);
    setName(program.name);
    setTypes(sourceDays.map((day) => day.type));
    setDayNames(sourceDays.map((day) => day.type === 'Rest' ? '' : day.name));
    setSelected(sourceDays.reduce<Record<number, Exercise[]>>((result, day, index) => {
      result[index] = day.exercises;
      return result;
    }, {}));
    setDayIndex(editableStart);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: editorOffset.current, animated: true }));
  };

  const openStartDatePicker = () => {
    setCalendarMonth(fromIsoDate(startDate));
    setDatePickerVisible(true);
  };

  const changeCalendarMonth = (offset: number) => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const selectStartDate = (date: string) => {
    setStartDate(date);
    setDatePickerVisible(false);
  };

  const openExerciseConfig = (item: PendingExercise) => {
    setPending(item);
    setExerciseName(item.name);
    setTargetSets(item.defaultSets);
    setTargetReps(item.defaultReps);
    setCustomGroup(item.custom && groups.includes(item.group) ? item.group : groups[0] ?? 'Petto');
  };

  const openCatalogConfig = (item: { name: string; group: string; sets: number; reps: number; custom?: boolean }) => {
    openExerciseConfig({
      name: item.name,
      group: item.group,
      defaultSets: String(item.sets),
      defaultReps: String(item.reps),
      custom: item.custom ?? false,
    });
  };

  const openCustomConfig = () => {
    openExerciseConfig({
      name: '',
      group: 'Custom',
      defaultSets: '',
      defaultReps: '',
      custom: true,
    });
  };

  const closeExerciseConfig = () => {
    setPending(null);
    setExerciseName('');
    setTargetSets('');
    setTargetReps('');
    setCustomGroup(groups[0] ?? 'Petto');
  };

  const saveExercise = () => {
    const cleanName = exerciseName.trim();
    const sets = Number(targetSets);
    const reps = Number(targetReps);
    if (!cleanName || !Number.isInteger(sets) || sets < 1 || sets > 20 || !Number.isInteger(reps) || reps < 1 || reps > 100) {
      Alert.alert('Dati non validi', 'Inserisci un nome, almeno 1 set e un target di ripetizioni valido.');
      return;
    }
    const exercise: Exercise = {
      id: pending?.id ?? `${dayIndex}-${cleanName}-${Date.now()}`,
      name: cleanName,
      group: pending?.custom ? customGroup : pending?.group ?? 'Custom',
      custom: pending?.custom ?? false,
      targetSets: sets,
      targetReps: reps,
      sets: Array.from({ length: sets }, (_, setIndex) => {
        const previousExercise = (selected[dayIndex] ?? []).find(
          (item) => item.id === pending?.id || item.name === cleanName,
        );
        const previousSet = previousExercise?.sets[setIndex];
        return {
          id: previousSet?.id ?? `${dayIndex}-${cleanName}-${Date.now()}-${setIndex}`,
          weight: previousSet?.weight ?? '',
          reps: previousSet?.reps ?? '',
        };
      }),
    };
    setSelected((current) => {
      const list = current[dayIndex] ?? [];
      const existingIndex = list.findIndex((item) => item.id === pending?.id || item.name === cleanName);
      const next = existingIndex >= 0 ? list.map((item, index) => (index === existingIndex ? exercise : item)) : [...list, exercise];
      return { ...current, [dayIndex]: next };
    });
    markDayEdited(dayIndex);
    closeExerciseConfig();
  };

  const removeExercise = (exerciseNameToRemove: string) => {
    markDayEdited(dayIndex);
    setSelected((current) => ({
      ...current,
      [dayIndex]: (current[dayIndex] ?? []).filter((exercise) => exercise.name !== exerciseNameToRemove),
    }));
  };

  const editExercise = (exercise: Exercise) => {
    openExerciseConfig({
      name: exercise.name,
      id: exercise.id,
      group: exercise.group,
      defaultSets: String(exercise.targetSets),
      defaultReps: String(exercise.targetReps),
      custom: exercise.custom ?? exercise.group === 'Custom',
    });
  };

  const save = () => {
    if (!types.some((type) => type !== 'Rest')) {
      Alert.alert('Scegli i giorni di allenamento', 'Imposta almeno un giorno come Allenamento prima di salvare il programma.');
      return;
    }
    const missingExercises = types.findIndex((type, index) => {
      if (type === 'Rest' || (selected[index] ?? []).length > 0) return false;
      const replacedByPropagation = editingProgram && editedDayIndices.some((sourceIndex) =>
        sourceIndex !== index && (sourceIndex < index || (sourceIndex === 6 && index < 6)),
      );
      return !replacedByPropagation;
    });
    if (missingExercises >= 0) {
      setDayIndex(missingExercises);
      Alert.alert('Aggiungi un esercizio', `Il Giorno ${missingExercises + 1} è un giorno di allenamento: aggiungi almeno un esercizio.`);
      return;
    }
    const commit = () => {
      const program = createProgram(
        name.trim() || 'Il mio programma',
        types.map((type, index) => ({ type, name: dayNames[index], exercises: type === 'Rest' ? [] : selected[index] ?? [] })),
        startDate,
      );
      if (editingProgram) {
        workout.updateProgram(editingProgram.id, program.name, program.days, editedDayIndices);
      } else {
        workout.createNewProgram(program);
      }
      router.back();
    };
    const currentDay = editingActiveToday ? editingProgram?.days[editingElapsedDays] : undefined;
    const editedCurrentExercises = types[editingElapsedDays] === 'Rest' ? [] : selected[editingElapsedDays] ?? [];
    const removesEnteredValues = Boolean(
      currentDay &&
      !editingActiveTodaySaved &&
      currentDay.exercises.some((exercise) => {
        const replacement = editedCurrentExercises.find(
          (item) => item.id === exercise.id || item.name === exercise.name,
        );
        const removedSets = replacement
          ? exercise.sets.slice(replacement.sets.length)
          : exercise.sets;
        return removedSets.some((set) => Boolean(set.weight.trim() || set.reps.trim()));
      }),
    );
    if (removesEnteredValues) {
      Alert.alert(
        'Modifiche alla sessione di oggi',
        'Alcuni valori inseriti appartengono a esercizi o serie che stai rimuovendo. Continuando, quei valori verranno eliminati dalla sessione di oggi.',
        [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Elimina e salva', style: 'destructive', onPress: commit },
        ],
      );
      return;
    }
    commit();
  };

  return (
    <View style={[page.root, { backgroundColor: colors.background }]}>
      <ScrollView ref={scrollRef} contentContainerStyle={[page.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
        <View style={page.header}><Pressable onPress={() => router.back()}><Feather name="x" size={24} color={colors.foreground} /></Pressable><Text style={[page.title, { color: colors.foreground }]}>Programmi</Text><View style={{ width: 24 }} /></View>
        <Text style={[page.subtitle, { color: colors.mutedForeground }]}>Crea un ciclo da 7 giorni. Per ogni esercizio scegli quanti set e quante ripetizioni target vuoi fare.</Text>
         <Text style={[page.label, { color: colors.foreground }]}>Programmi salvati</Text>
         <View style={[page.programList, { backgroundColor: colors.card, borderColor: colors.border }]}>
           {workout.programs.map((program) => {
             const active = program.id === workout.activeProgramId;
              const scheduled = program.id === workout.scheduledProgramId;
             const trainingDays = program.days.filter((day) => day.type !== 'Rest').length;
             const exerciseCount = program.days.reduce((total, day) => total + day.exercises.length, 0);
             return <View key={program.id} style={[page.programRow, { borderBottomColor: colors.border }]}>
                <Pressable disabled={scheduled} onPress={() => { if (!active) workout.switchProgram(program.id); router.back(); }} style={({ pressed }) => [page.programMain, { opacity: scheduled ? 0.65 : pressed ? 0.72 : 1 }]}>
                 <View style={[page.programIcon, { backgroundColor: active ? colors.accent : colors.muted }]}><Feather name={active ? 'check' : 'layers'} size={16} color={active ? colors.primary : colors.mutedForeground} /></View>
                  <View style={{ flex: 1 }}><Text style={[page.programRowName, { color: colors.foreground }]}>{program.name}</Text><Text style={[page.programRowMeta, { color: colors.mutedForeground }]}>{trainingDays} giorni · {exerciseCount} esercizi · ciclo {program.cycleNumber}</Text>{scheduled ? <Text style={[page.programRowMeta, { color: colors.primary }]}>Inizia il {formatItalianDateLong(program.cycleStart)}</Text> : null}</View>
                  <Text style={[page.programStatus, { color: active ? colors.success : colors.primary }]}>{active ? 'ATTIVO' : scheduled ? 'PROGRAMMATO' : 'ATTIVA'}</Text>
               </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Modifica ${program.name}`} onPress={() => editSavedProgram(program)} hitSlop={8} style={page.rowAction}><Feather name="edit-2" size={16} color={colors.primary} /></Pressable>
               <Pressable onPress={() => {
                 if (workout.programs.length <= 1) {
                   Alert.alert('Programma necessario', 'Mantieni almeno un programma salvato.');
                   return;
                 }
                 Alert.alert('Eliminare programma?', `Il programma "${program.name}" e il suo storico verranno eliminati.`, [
                   { text: 'Annulla', style: 'cancel' },
                    { text: 'Elimina', style: 'destructive', onPress: () => { workout.deleteProgram(program.id); if (editingProgramId === program.id) resetEditor(); if (active) router.back(); } },
                 ]);
               }} hitSlop={8} style={page.deleteProgramButton}><Feather name="trash-2" size={16} color={workout.programs.length <= 1 ? colors.mutedForeground : colors.destructive} /></Pressable>
             </View>;
           })}
         </View>
          <View style={page.formSection} onLayout={(event) => { editorOffset.current = event.nativeEvent.layout.y; }}>
          <Text style={[page.sectionLabel, { color: colors.foreground }]}>{editingProgram ? 'Modifica programma' : 'Crea un nuovo programma'}</Text>
            {editingProgram ? <View style={[page.editNotice, { backgroundColor: colors.accent }]}><Feather name="clock" size={15} color={colors.primary} /><Text style={[page.editNoticeText, { color: colors.accentForeground }]}>{editingActiveToday ? editingActiveTodaySaved ? 'La giornata di oggi è già salvata: la sua modifica sarà attiva dalla prossima occorrenza. L’allenamento registrato resta invariato.' : 'Se modifichi la giornata di oggi, la modifica si applica subito. Le sessioni già completate restano invariate.' : editingElapsedDays < 0 ? `Il programma inizia il ${formatItalianDateLong(editingProgram.cycleStart)}. Le modifiche saranno pronte da quella data.` : editingElapsedDays >= 6 ? 'Puoi modificare anche i giorni completati. La scheda scelta verrà applicata ai giorni successivi dal prossimo ciclo; lo storico resta invariato.' : 'Puoi modificare anche i giorni completati: la scheda scelta verrà applicata a tutti i giorni successivi. Gli allenamenti già registrati restano invariati.'}</Text></View> : null}
          <Text style={[page.label, { color: colors.foreground }]}>Nome programma</Text>
          <TextInput value={name} onChangeText={setName} placeholder="es. Forza e controllo" placeholderTextColor={colors.mutedForeground} style={[page.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} />
           {!editingProgram ? <>
             <Text style={[page.label, { color: colors.foreground }]}>Data di inizio</Text>
             <Pressable onPress={openStartDatePicker} style={[page.startDateButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
               <View style={[page.startDateIcon, { backgroundColor: colors.accent }]}><Feather name="calendar" size={16} color={colors.primary} /></View>
               <View style={{ flex: 1 }}><Text style={[page.startDateValue, { color: colors.foreground }]}>{formatItalianDateLong(startDate)}</Text><Text style={[page.startDateHint, { color: colors.mutedForeground }]}>Oggi o una data futura</Text></View>
               <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
             </Pressable>
           </> : null}
          <Text style={[page.label, { color: colors.foreground }]}>Struttura settimana</Text>
          {types.map((type, index) => {
            const pastDay = Boolean(editingProgram && index < editingElapsedDays);
            const isToday = editingActiveToday && index === editingElapsedDays;
            const savedDay = editingProgram?.days[index];
            const dayLabel = isToday
              ? savedDay?.completed
                ? 'Completato · prossima volta'
                : 'Oggi · applicazione immediata'
              : savedDay?.completed
              ? 'Completato · modificabile'
              : savedDay?.skipped
                ? 'Saltato · modificabile'
                : 'Passato · modificabile';
            const trainingSelected = type !== 'Rest';
            return (
              <View key={index} style={[page.dayRow, { backgroundColor: colors.card, borderColor: index === dayIndex ? colors.primary : colors.border }]}>
                <Pressable onPress={() => setDayIndex(index)} style={page.dayIndex}><View style={[page.dayIndexCircle, { backgroundColor: colors.muted }]}><Text style={[page.dayIndexText, { color: colors.mutedForeground }]}>{index + 1}</Text></View></Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={[page.dayName, { color: colors.foreground }]}>Giorno {index + 1}</Text>
                  {type === 'Rest'
                    ? <Text style={[page.dayType, { color: colors.mutedForeground }]}>{isToday ? dayLabel : pastDay ? dayLabel : 'Riposo'}</Text>
                    : <><TextInput value={dayNames[index]} onChangeText={(value) => setDayName(index, value)} placeholder="Nome allenamento (es. Push)" placeholderTextColor={colors.mutedForeground} style={[page.dayNameInput, { color: colors.foreground, borderColor: colors.border }]} /><Text style={[page.dayExerciseCount, { color: colors.mutedForeground }]}>{(selected[index] ?? []).length} esercizi · {isToday || pastDay ? dayLabel : 'modificabile'}</Text></>}
                </View>
                <View style={[page.typeOptions, { backgroundColor: colors.muted }]}>
                  {(['Upper', 'Rest'] as DayType[]).map((option) => {
                    const selectedType = option === 'Rest' ? !trainingSelected : trainingSelected;
                    return <Pressable key={option} onPress={() => setDayType(index, option)} style={[page.typeOption, { backgroundColor: selectedType ? colors.accent : 'transparent' }]}><Text style={[page.typeButtonText, { color: selectedType ? colors.primary : colors.mutedForeground }]}>{option === 'Rest' ? 'Riposo' : 'Allenamento'}</Text></Pressable>;
                  })}
                </View>
              </View>
            );
          })}
         {types[dayIndex] !== 'Rest' ? (
          <View style={[page.exercisePicker, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={page.pickerHeader}><View><Text style={[page.pickerTitle, { color: colors.foreground }]}>Esercizi · giorno {dayIndex + 1}</Text><Text style={[page.pickerSubtitle, { color: colors.mutedForeground }]}>Tocca un esercizio e imposta il suo target</Text></View><Pressable onPress={() => setDayIndex((dayIndex + 1) % 7)}><Text style={[page.next, { color: colors.primary }]}>Prossimo</Text></Pressable></View>
            <View style={page.selectedHeader}><Text style={[page.groupTitle, { color: colors.mutedForeground }]}>AGGIUNTI ({currentExercises.length})</Text><Pressable onPress={openCustomConfig} style={[page.customButton, { backgroundColor: colors.accent }]}><Feather name="plus" size={14} color={colors.primary} /><Text style={[page.customButtonText, { color: colors.primary }]}>Custom</Text></Pressable></View>
            {currentExercises.length === 0 ? <Text style={[page.noExercises, { color: colors.mutedForeground }]}>Nessun esercizio aggiunto a questa giornata.</Text> : currentExercises.map((exercise) => <View key={exercise.id} style={[page.selectedRow, { backgroundColor: colors.surface2 }]}><View style={[page.checkbox, { backgroundColor: colors.primary, borderColor: colors.primary }]}><Feather name="check" size={12} color={colors.primaryForeground} /></View><View style={{ flex: 1 }}><Text style={[page.choiceName, { color: colors.foreground }]}>{exercise.name}</Text><Text style={[page.selectedTarget, { color: colors.mutedForeground }]}>{exercise.targetSets} set × {exercise.targetReps} rip. target · {exercise.group}</Text></View><Pressable onPress={() => editExercise(exercise)} hitSlop={8}><Feather name="edit-2" size={15} color={colors.primary} /></Pressable><Pressable onPress={() => removeExercise(exercise.name)} hitSlop={8}><Feather name="trash-2" size={15} color={colors.destructive} /></Pressable></View>)}
            <Text style={[page.groupTitle, { color: colors.mutedForeground }]}>CATALOGO</Text>
             {groups.map((group) => {
               const groupCatalog = [
                 ...exerciseCatalog.filter((item) => item.group === group),
                 ...savedCustomCatalog.filter((item) => item.group === group),
               ];
               if (groupCatalog.length === 0) return null;
               return <View key={group}><Text style={[page.catalogGroup, { color: colors.mutedForeground }]}>{group}</Text>{groupCatalog.map((item) => { const checked = currentExercises.some((exercise) => exercise.name === item.name); return <Pressable key={`${group}-${item.name}`} testID={`catalog-exercise-${item.name}`} onPress={() => checked ? removeExercise(item.name) : openCatalogConfig(item)} style={page.exerciseChoice}><View style={[page.checkbox, { borderColor: checked ? colors.primary : colors.border, backgroundColor: checked ? colors.primary : 'transparent' }]}>{checked ? <Feather name="check" size={12} color={colors.primaryForeground} /> : null}</View><Text style={[page.choiceName, { color: colors.foreground }]}>{item.name}</Text><Text style={[page.choiceTarget, { color: colors.mutedForeground }]}>{checked ? 'Aggiunto' : item.custom ? 'Personalizzato' : `${item.sets}×${item.reps} suggerito`}</Text></Pressable>; })}</View>;
             })}
          </View>
        ) : null}
          <PrimaryButton label={editingProgram ? 'Salva modifiche' : startDate > workout.today ? 'Pianifica programma' : 'Salva e attiva nuovo programma'} icon="check" onPress={save} />
          <SecondaryButton label={editingProgram ? 'Annulla modifica' : 'Annulla'} onPress={() => editingProgram ? resetEditor() : router.back()} />
          </View>
      </ScrollView>
      <Modal visible={pending !== null} transparent animationType="slide" onRequestClose={closeExerciseConfig}>
        <View style={[page.modalBackdrop, { backgroundColor: `${colors.background}CC` }]}>
          <View style={[page.modalCard, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 18 }]}>
            <View style={page.modalHandle} />
            <View style={page.modalHeader}><View style={{ flex: 1 }}><Text style={[page.modalTitle, { color: colors.foreground }]}>{pending?.custom ? 'Nuovo esercizio custom' : 'Imposta esercizio'}</Text><Text style={[page.modalSubtitle, { color: colors.mutedForeground }]}>Definisci il target prima di aggiungerlo</Text></View><Pressable onPress={closeExerciseConfig}><Feather name="x" size={20} color={colors.mutedForeground} /></Pressable></View>
            <Text style={[page.modalLabel, { color: colors.foreground }]}>Nome esercizio</Text>
            <TextInput value={exerciseName} onChangeText={setExerciseName} editable={pending?.custom ?? false} placeholder="es. Affondi bulgari" placeholderTextColor={colors.mutedForeground} style={[page.modalInput, { color: colors.foreground, backgroundColor: colors.surface2, borderColor: colors.border, opacity: pending?.custom ? 1 : 0.7 }]} />
             {pending?.custom ? <View><Text style={[page.modalLabel, { color: colors.foreground }]}>Gruppo muscolare</Text><View style={page.groupOptions}>{groups.map((group) => <Pressable key={group} onPress={() => setCustomGroup(group)} style={[page.groupOption, { backgroundColor: customGroup === group ? colors.accent : colors.surface2, borderColor: customGroup === group ? colors.primary : colors.border }]}><Text style={[page.groupOptionText, { color: customGroup === group ? colors.primary : colors.mutedForeground }]}>{group}</Text></Pressable>)}</View></View> : null}
            <View style={page.targetRow}><View style={{ flex: 1 }}><Text style={[page.modalLabel, { color: colors.foreground }]}>Numero di set</Text><TextInput value={targetSets} onChangeText={setTargetSets} keyboardType="number-pad" returnKeyType="done" placeholder="3" placeholderTextColor={colors.mutedForeground} style={[page.modalInput, { color: colors.foreground, backgroundColor: colors.surface2, borderColor: colors.border }]} /></View><View style={{ flex: 1 }}><Text style={[page.modalLabel, { color: colors.foreground }]}>Ripetizioni target</Text><TextInput value={targetReps} onChangeText={setTargetReps} keyboardType="number-pad" returnKeyType="done" placeholder="10" placeholderTextColor={colors.mutedForeground} style={[page.modalInput, { color: colors.foreground, backgroundColor: colors.surface2, borderColor: colors.border }]} /></View></View>
            <PrimaryButton label="Aggiungi esercizio" icon="plus" onPress={saveExercise} />
            <SecondaryButton label="Annulla" onPress={closeExerciseConfig} />
          </View>
        </View>
      </Modal>
      <Modal visible={datePickerVisible} transparent animationType="slide" onRequestClose={() => setDatePickerVisible(false)}>
        <View style={[page.modalBackdrop, { backgroundColor: `${colors.background}CC` }]}>
          <View style={[page.dateModal, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 18 }]}>
            <View style={page.modalHandle} />
            <View style={page.dateModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[page.modalTitle, { color: colors.foreground }]}>Inizio programma</Text>
                <Text style={[page.modalSubtitle, { color: colors.mutedForeground }]}>Scegli oggi o una data futura</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Chiudi calendario" onPress={() => setDatePickerVisible(false)} hitSlop={8}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <View style={page.calendarMonthRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mese precedente"
                disabled={!canShowPreviousMonth}
                onPress={() => changeCalendarMonth(-1)}
                style={[page.calendarNav, { backgroundColor: colors.surface2, opacity: canShowPreviousMonth ? 1 : 0.35 }]}
              >
                <Feather name="chevron-left" size={18} color={colors.foreground} />
              </Pressable>
              <Text style={[page.calendarMonthTitle, { color: colors.foreground }]}>{formattedCalendarMonthTitle}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mese successivo"
                onPress={() => changeCalendarMonth(1)}
                style={[page.calendarNav, { backgroundColor: colors.surface2 }]}
              >
                <Feather name="chevron-right" size={18} color={colors.foreground} />
              </Pressable>
            </View>
            <View style={page.calendarWeekRow}>
              {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((weekday, index) => (
                <Text key={`${weekday}-${index}`} style={[page.calendarWeekday, { color: colors.mutedForeground }]}>{weekday}</Text>
              ))}
            </View>
            <View style={page.calendarGrid}>
              {calendarCells.map((cell, index) => cell ? (
                <Pressable
                  key={cell.date}
                  accessibilityRole="button"
                  accessibilityLabel={`Scegli ${formatItalianDateLong(cell.date)}`}
                  accessibilityState={{ disabled: cell.disabled, selected: cell.selected }}
                  disabled={cell.disabled}
                  onPress={() => selectStartDate(cell.date)}
                  style={[
                    page.calendarDay,
                    { backgroundColor: cell.selected ? colors.primary : 'transparent', opacity: cell.disabled ? 0.35 : 1 },
                  ]}
                >
                  <Text style={[page.calendarDayText, { color: cell.selected ? colors.primaryForeground : colors.foreground }]}>{cell.day}</Text>
                </Pressable>
              ) : (
                <View key={`blank-${index}`} style={page.calendarDay} />
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const page = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 18, gap: 13 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  existing: { borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  existingIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  existingTitle: { fontSize: 14, fontWeight: '800' },
  existingMeta: { fontSize: 11, marginTop: 3 },
  active: { fontSize: 10, fontWeight: '900' },
  programList: { borderWidth: 1, borderRadius: 22, overflow: 'hidden' },
  programRow: { minHeight: 68, paddingLeft: 12, paddingRight: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  programMain: { flex: 1, minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowAction: { padding: 8, marginLeft: 2 },
  deleteProgramButton: { padding: 8, marginLeft: 4 },
  programIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  programRowName: { fontSize: 14, fontWeight: '800' },
  programRowMeta: { fontSize: 11, marginTop: 4 },
  programStatus: { fontSize: 10, fontWeight: '900' },
  sectionLabel: { fontSize: 17, fontWeight: '900', marginTop: 9, letterSpacing: -0.2 },
  formSection: { gap: 13 },
  editNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, borderRadius: 15 },
  editNoticeText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '800', marginTop: 6 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 16, paddingHorizontal: 15, fontSize: 15 },
  startDateButton: { minHeight: 64, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  startDateIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  startDateValue: { fontSize: 14, fontWeight: '800' },
  startDateHint: { fontSize: 11, marginTop: 3 },
  dayRow: { borderWidth: 1, borderRadius: 20, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayIndex: { width: 30, alignItems: 'center' },
  dayIndexCircle: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dayIndexText: { fontSize: 12, fontWeight: '900' },
  dayName: { fontSize: 14, fontWeight: '900' },
  dayType: { fontSize: 11, marginTop: 3 },
  dayNameInput: { minHeight: 26, paddingVertical: 0, paddingHorizontal: 0, borderBottomWidth: 1, fontSize: 11, marginTop: 2 },
  dayExerciseCount: { fontSize: 10, marginTop: 3 },
  typeOptions: { flexDirection: 'row', alignItems: 'center', borderRadius: 9, padding: 2, gap: 1 },
  typeOption: { paddingHorizontal: 5, paddingVertical: 7, borderRadius: 7 },
  typeButtonText: { fontSize: 10, fontWeight: '800' },
  exercisePicker: { borderWidth: 1, borderRadius: 22, padding: 15, marginTop: 4, gap: 7 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  pickerTitle: { fontSize: 15, fontWeight: '900' },
  pickerSubtitle: { fontSize: 11, marginTop: 3 },
  next: { fontSize: 12, fontWeight: '900' },
  selectedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectedRow: { minHeight: 54, borderRadius: 15, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  selectedTarget: { fontSize: 10, marginTop: 3 },
  customButton: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8 },
  customButtonText: { fontSize: 11, fontWeight: '900' },
  noExercises: { fontSize: 12, paddingVertical: 8 },
  groupTitle: { fontSize: 11, fontWeight: '800', marginTop: 10, marginBottom: 2, letterSpacing: 0.6 },
  catalogGroup: { fontSize: 10, fontWeight: '800', marginTop: 7, marginBottom: 1, textTransform: 'uppercase' },
  exerciseChoice: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  choiceName: { flex: 1, fontSize: 13, fontWeight: '700' },
  choiceTarget: { fontSize: 10, fontWeight: '700' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 19, gap: 10 },
  modalHandle: { width: 36, height: 4, borderRadius: 4, backgroundColor: '#777180', alignSelf: 'center', marginBottom: 4 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  modalTitle: { fontSize: 20, fontWeight: '900' },
  modalSubtitle: { fontSize: 12, marginTop: 4 },
  modalLabel: { fontSize: 12, fontWeight: '800', marginTop: 3 },
  modalInput: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, fontSize: 15 },
  targetRow: { flexDirection: 'row', gap: 10 },
  groupOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  groupOption: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 },
  groupOptionText: { fontSize: 11, fontWeight: '800' },
  dateModal: { width: '100%', maxHeight: '92%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 19, gap: 15 },
  dateModalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2 },
  calendarMonthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calendarNav: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  calendarMonthTitle: { fontSize: 16, fontWeight: '800' },
  calendarWeekRow: { flexDirection: 'row' },
  calendarWeekday: { width: '14.2857%', textAlign: 'center', fontSize: 11, fontWeight: '800', paddingVertical: 7 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarDay: { width: '14.2857%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  calendarDayText: { fontSize: 14, fontWeight: '700' },
});