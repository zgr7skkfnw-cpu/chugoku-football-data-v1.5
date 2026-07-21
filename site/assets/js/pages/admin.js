import {
  createNotice,
  createPageHeader,
  createPanel,
  element,
} from "../ui/elements.js";
import { dataUrl } from "../api/seasons.js";

export function renderAdminPage({ matches, competitionDefinitions = [], availableSeasons = [] }) {
  const definitions = competitionDefinitions.length
    ? competitionDefinitions
    : createCompetitionDefinitionsFromMatches(matches);
  const seasons = availableSeasons.length
    ? availableSeasons
    : [...new Set(definitions.map((entry) => entry.season))].sort((left, right) => right - left);
  let availableMatches = [];
  let hasUnsavedChanges = false;

  const seasonSelect = element("select", {
    className: "admin-input",
    attributes: { "aria-label": "補正する年度" },
  }, seasons.map((season) => createOption(String(season), `${season}年度`)));

  const competitionSelect = element("select", {
    className: "admin-input",
    attributes: { "aria-label": "補正する大会" },
  });

  const editTarget = element("strong", {
    className: "admin-edit-target",
    text: "編集対象を選択してください。",
  });

  const saveTarget = element("p", {
    className: "admin-save-target",
  });

  const competitionStatus = element("p", {
    className: "admin-competition-status",
  });

  function selectedCompetition() {
    return definitions.find((entry) => entry.id === competitionSelect.value) ?? null;
  }

  function competitionsForSeason() {
    return definitions.filter((entry) => entry.season === Number(seasonSelect.value));
  }

  function updateCompetitionOptions(preferredId = null) {
    const competitions = competitionsForSeason();
    competitionSelect.replaceChildren(...competitions.map((competition) =>
      createOption(competition.id, competition.name.replace(/^\d{4}年度\s*/, "")),
    ));
    if (preferredId && competitions.some((entry) => entry.id === preferredId)) {
      competitionSelect.value = preferredId;
    }
  }

  function updateMatchOptions() {
    const competition = selectedCompetition();
    availableMatches = [...matches]
      .filter((match) => match.competitionId === competition?.id)
      .sort(
    (left, right) =>
      new Date(right.kickoffAt).getTime()
      - new Date(left.kickoffAt).getTime(),
      );

    matchSelect.replaceChildren(
      element("option", {
        text: availableMatches.length
          ? "試合を選択してください"
          : "試合データはまだありません",
        attributes: { value: "" },
      }),
      ...availableMatches.map((match) =>
        element("option", {
          text: createMatchOptionLabel(match),
          attributes: { value: match.id },
        }),
      ),
    );
    matchSelect.disabled = availableMatches.length === 0;
    competitionStatus.textContent = availableMatches.length
      ? `${availableMatches.length}試合から選択できます。`
      : "この大会の試合データはまだありません。";
    editTarget.textContent = competition
      ? `編集対象：${competition.season}年／${competition.name.replace(/^\d{4}年度\s*/, "")}`
      : "編集対象を選択してください。";
    saveTarget.textContent = competition
      ? `保存対象：${competition.season}年 ${createCompetitionLabel(competition)} 手動補正データ`
      : "保存対象を選択してください。";
  }

  let existingOverrideItems = [];
  let overrideLoadStatus = "idle";

  const matchSelect = element("select", {
    className: "admin-input",
    attributes: {
      "aria-label": "補正する試合",
    },
  });

  seasonSelect.value = String(seasons[0] ?? "");
  updateCompetitionOptions();
  updateMatchOptions();

  const statusSelect = element("select", {
    className: "admin-input",
  }, [
    createOption("finished", "試合終了"),
    createOption("scheduled", "開催予定"),
    createOption("postponed", "延期"),
    createOption("cancelled", "中止"),
    createOption("suspended", "中断"),
  ]);

  const homeScoreInput = createNumberInput();
  const awayScoreInput = createNumberInput();

  const venueInput = createTextInput("試合会場");
  const attendanceInput = createNumberInput();
  const matchFormatInput = createTextInput(
    "例：試合時間：90分 PK戦：なし",
  );

  const weatherInput = createTextInput("例：晴");
  const windInput = createTextInput("例：微風");
  const pitchInput = createTextInput("例：良");

  const officialsInput = createTextarea(
    "1行ごとに 役割|氏名\n"
      + "例：主審|宮崎 樹\n"
      + "副審|井上 遊星",
    8,
  );

  const homeShotsInput = createNumberInput();
  const awayShotsInput = createNumberInput();

  const homeGoalKicksInput = createNumberInput();
  const awayGoalKicksInput = createNumberInput();

  const homeCornerKicksInput = createNumberInput();
  const awayCornerKicksInput = createNumberInput();

  const homeDirectFreeKicksInput = createNumberInput();
  const awayDirectFreeKicksInput = createNumberInput();

  const homeIndirectFreeKicksInput = createNumberInput();
  const awayIndirectFreeKicksInput = createNumberInput();

  const homeOffsidesInput = createNumberInput();
  const awayOffsidesInput = createNumberInput();

  const homePenaltiesInput = createNumberInput();
  const awayPenaltiesInput = createNumberInput();

  const notesInput = createTextarea(
    "1行ごとに備考を入力",
    5,
  );

  const reasonInput = element("textarea", {
    className: "admin-input",
    attributes: {
      rows: "3",
      placeholder: "例：公式記録が自動取得できなかったため",
    },
  });

  const resumedCheckbox = element("input", {
    attributes: {
      type: "checkbox",
    },
  });

  const resumedDateInput = element("input", {
    className: "admin-input",
    attributes: {
      type: "date",
      disabled: "",
    },
  });

  const firstHalfHomeInput = createNumberInput();
  const firstHalfAwayInput = createNumberInput();
  const secondHalfHomeInput = createNumberInput();
  const secondHalfAwayInput = createNumberInput();

  const goalsInput = createTextarea(
    "1行ごとに 時間|チーム名|背番号|得点者|アシスト\n例：45|広島文化学園大学|9|松本 大雅|露口 創一朗",
    6,
  );

  const homeDisciplinaryInput = createTextarea(
    "1行ごとに 時間|種別|選手名|理由\n例：72|警告|山田 太郎|反スポーツ的行為",
    5,
  );

  const awayDisciplinaryInput = createTextarea(
    "1行ごとに 時間|種別|選手名|理由\n例：90+2|退場|佐藤 次郎|著しい反則",
    5,
  );

  const homeSubstitutionsInput = createTextarea(
    "1行ごとに 時間|交代OUT|交代IN\n例：42|石田 怜桜|松本 大雅",
    5,
  );

  const awaySubstitutionsInput = createTextarea(
    "1行ごとに 時間|交代OUT|交代IN\n例：78|湯上 瑛太|谷口 颯汰",
    5,
  );

  const homeManagerInput = createTextInput(
    "ホームチーム監督",
  );

  const awayManagerInput = createTextInput(
    "アウェーチーム監督",
  );

  const homeStartersInput = createTextarea(
    "1行ごとに ポジション|背番号|選手名\n例：GK|57|末岡 宏斗",
    12,
  );

  const awayStartersInput = createTextarea(
    "1行ごとに ポジション|背番号|選手名\n例：GK|1|久保田 源心",
    12,
  );

  const homeSubstitutesInput = createTextarea(
    "1行ごとに ポジション|背番号|選手名\n例：MF|24|黒川 泰輝",
    12,
  );

  const awaySubstitutesInput = createTextarea(
    "1行ごとに ポジション|背番号|選手名\n例：MF|23|谷口 颯汰",
    12,
  );

  const destination = element("strong", {
    text: "試合を選ぶと保存先を表示します。",
  });

  const existingStatus = element("p", {
    text: "既存の補正データはまだ読み込んでいません。",
  });

  const validationStatus = element("div", {
    className: "admin-validation-status",
    text: "入力内容を確認します。",
  });

  const preview = element("pre", {
    className: "admin-json-preview",
    text: "補正内容はまだありません。",
  });

  const draftStatus = element("p", {
    className: "admin-draft-status",
    text: "下書きはまだありません。",
  });

  const clearDraftButton = element("button", {
    className: "button button--secondary",
    text: "この試合の下書きを削除",
    attributes: {
      type: "button",
      disabled: "",
    },
  });

  const downloadButton = element("button", {
    className: "button",
    text: "統合済み補正JSONをダウンロード",
    attributes: {
      type: "button",
      disabled: "",
    },
  });

  function selectedMatch() {
    return availableMatches.find(
      (match) => match.id === matchSelect.value,
    );
  }

  async function updateFormFromMatch() {
    const match = selectedMatch();

    existingOverrideItems = [];
    overrideLoadStatus = "idle";

    if (!match) {
      downloadButton.disabled = true;
      destination.textContent =
        "試合を選ぶと保存先を表示します。";
      existingStatus.textContent =
        "既存の補正データはまだ読み込んでいません。";
      preview.textContent =
        "補正内容はまだありません。";
      return;
    }

    statusSelect.value = match.status ?? "scheduled";
    homeScoreInput.value = match.homeTeam?.score ?? "";
    awayScoreInput.value = match.awayTeam?.score ?? "";

    venueInput.value = match.venue ?? "";
    attendanceInput.value = match.attendance ?? "";
    matchFormatInput.value = match.matchFormat ?? "";

    weatherInput.value =
      match.conditions?.weather ?? "";
    windInput.value =
      match.conditions?.wind ?? "";
    pitchInput.value =
      match.conditions?.pitch ?? "";

    officialsInput.value = formatOfficialsForInput(
      match.officials ?? [],
    );

    const homeStats =
      match.manualStatistics?.home ?? {};
    const awayStats =
      match.manualStatistics?.away ?? {};

    homeShotsInput.value = homeStats.shots ?? "";
    awayShotsInput.value = awayStats.shots ?? "";

    homeGoalKicksInput.value =
      homeStats.goalKicks ?? "";
    awayGoalKicksInput.value =
      awayStats.goalKicks ?? "";

    homeCornerKicksInput.value =
      homeStats.cornerKicks ?? "";
    awayCornerKicksInput.value =
      awayStats.cornerKicks ?? "";

    homeDirectFreeKicksInput.value =
      homeStats.directFreeKicks ?? "";
    awayDirectFreeKicksInput.value =
      awayStats.directFreeKicks ?? "";

    homeIndirectFreeKicksInput.value =
      homeStats.indirectFreeKicks ?? "";
    awayIndirectFreeKicksInput.value =
      awayStats.indirectFreeKicks ?? "";

    homeOffsidesInput.value =
      homeStats.offsides ?? "";
    awayOffsidesInput.value =
      awayStats.offsides ?? "";

    homePenaltiesInput.value =
      homeStats.penalties ?? "";
    awayPenaltiesInput.value =
      awayStats.penalties ?? "";

    notesInput.value = formatNotesForInput(
      match.notes,
      match.statusNote,
    );

    resumedCheckbox.checked = Boolean(match.wasResumed);
    resumedDateInput.disabled = !resumedCheckbox.checked;
    resumedDateInput.value = match.resumedDate ?? "";

    const firstHalf = match.scoreByPeriod?.find(
      (period) => period.label === "前半",
    );

    const secondHalf = match.scoreByPeriod?.find(
      (period) => period.label === "後半",
    );

    firstHalfHomeInput.value = firstHalf?.home ?? "";
    firstHalfAwayInput.value = firstHalf?.away ?? "";
    secondHalfHomeInput.value = secondHalf?.home ?? "";
    secondHalfAwayInput.value = secondHalf?.away ?? "";

    goalsInput.value = formatGoalsForInput(match.goals ?? []);

    homeDisciplinaryInput.value =
      formatDisciplinaryForInput(
        match.disciplinary?.home ?? [],
      );

    awayDisciplinaryInput.value =
      formatDisciplinaryForInput(
        match.disciplinary?.away ?? [],
      );

    homeSubstitutionsInput.value = formatSubstitutionsForInput(
      match.substitutions?.home ?? [],
    );
    awaySubstitutionsInput.value = formatSubstitutionsForInput(
      match.substitutions?.away ?? [],
    );

    homeManagerInput.value =
      match.lineups?.home?.manager ?? "";

    awayManagerInput.value =
      match.lineups?.away?.manager ?? "";

    homeStartersInput.value = formatPlayersForInput(
      match.lineups?.home?.starters ?? [],
    );

    awayStartersInput.value = formatPlayersForInput(
      match.lineups?.away?.starters ?? [],
    );

    homeSubstitutesInput.value = formatPlayersForInput(
      match.lineups?.home?.substitutes ?? [],
    );

    awaySubstitutesInput.value = formatPlayersForInput(
      match.lineups?.away?.substitutes ?? [],
    );

    reasonInput.value =
      match.manualOverrideReason
      ?? "管理画面から手動補正";

    const competition = selectedCompetition();
    destination.textContent = competition
      ? `保存先：${competition.season}年 ${createCompetitionLabel(competition)} 手動補正データ（${createDestinationPath(competition)}）`
      : "大会の保存先を確認できません。";

    downloadButton.disabled = true;
    overrideLoadStatus = "loading";
    existingStatus.textContent =
      "既存の補正データを確認しています…";

    await loadExistingOverrides(match, competition);

    downloadButton.disabled = false;
    updatePreview();
  }

  async function loadExistingOverrides(match, competition) {
    const path = createOverrideDataPath(competition);

    if (!path) {
      existingOverrideItems = [];
      overrideLoadStatus = "error";
      existingStatus.textContent = "選択中の大会の保存先を確認できません。";
      return;
    }

    if (!competition.manualOverrides) {
      existingOverrideItems = [];
      overrideLoadStatus = "ready";
      existingStatus.textContent =
        "既存の補正ファイルはありません。選択中の大会用として新しく作成します。";
      return;
    }

    try {
      const response = await fetch(dataUrl(path), {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

      if (response.status === 404) {
        existingOverrideItems = [];
        overrideLoadStatus = "ready";
        existingStatus.textContent =
          "既存の補正ファイルはありません。新しく作成します。";
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (
        data.schemaVersion !== 1
        || !Array.isArray(data.items)
      ) {
        throw new Error("対応していないデータ形式です。");
      }

      existingOverrideItems = data.items;
      overrideLoadStatus = "ready";

      const currentExists = existingOverrideItems.some(
        (item) => item.matchId === match.id,
      );

      existingStatus.textContent = currentExists
        ? `既存の補正は${existingOverrideItems.length}試合分あります。この試合の補正内容を更新します。`
        : `既存の補正は${existingOverrideItems.length}試合分あります。新しい試合として追加します。`;
    } catch (error) {
      existingOverrideItems = [];
      overrideLoadStatus = "error";
      existingStatus.textContent =
        `既存データの読み込みに失敗しました：${error.message}`;
    }
  }

  function buildCurrentOverrideItem() {
    const match = selectedMatch();

    if (!match) {
      return null;
    }

    const override = {
      status: statusSelect.value,
      homeTeam: {
        score: parseNullableNumber(homeScoreInput.value),
      },
      awayTeam: {
        score: parseNullableNumber(awayScoreInput.value),
      },
      venue: venueInput.value.trim() || null,
      attendance: parseNullableNumber(
        attendanceInput.value,
      ),
      matchFormat:
        matchFormatInput.value.trim() || null,
      conditions: {
        weather: weatherInput.value.trim() || null,
        wind: windInput.value.trim() || null,
        pitch: pitchInput.value.trim() || null,
      },
      officials: parseOfficials(
        officialsInput.value,
      ),
      manualStatistics: {
        home: {
          shots: parseNullableNumber(
            homeShotsInput.value,
          ),
          goalKicks: parseNullableNumber(
            homeGoalKicksInput.value,
          ),
          cornerKicks: parseNullableNumber(
            homeCornerKicksInput.value,
          ),
          directFreeKicks: parseNullableNumber(
            homeDirectFreeKicksInput.value,
          ),
          indirectFreeKicks: parseNullableNumber(
            homeIndirectFreeKicksInput.value,
          ),
          offsides: parseNullableNumber(
            homeOffsidesInput.value,
          ),
          penalties: parseNullableNumber(
            homePenaltiesInput.value,
          ),
        },
        away: {
          shots: parseNullableNumber(
            awayShotsInput.value,
          ),
          goalKicks: parseNullableNumber(
            awayGoalKicksInput.value,
          ),
          cornerKicks: parseNullableNumber(
            awayCornerKicksInput.value,
          ),
          directFreeKicks: parseNullableNumber(
            awayDirectFreeKicksInput.value,
          ),
          indirectFreeKicks: parseNullableNumber(
            awayIndirectFreeKicksInput.value,
          ),
          offsides: parseNullableNumber(
            awayOffsidesInput.value,
          ),
          penalties: parseNullableNumber(
            awayPenaltiesInput.value,
          ),
        },
      },
      notes: parseNotes(notesInput.value),
      statusNote:
        parseNotes(notesInput.value)[0] ?? null,
      wasResumed: resumedCheckbox.checked,
      resumedDate: resumedCheckbox.checked
        ? resumedDateInput.value || null
        : null,
      scoreByPeriod: [
        {
          label: "前半",
          home: parseNullableNumber(
            firstHalfHomeInput.value,
          ),
          away: parseNullableNumber(
            firstHalfAwayInput.value,
          ),
        },
        {
          label: "後半",
          home: parseNullableNumber(
            secondHalfHomeInput.value,
          ),
          away: parseNullableNumber(
            secondHalfAwayInput.value,
          ),
        },
      ],
      goals: parseGoals(
        goalsInput.value,
        match,
      ),
      disciplinary: {
        home: parseDisciplinary(
          homeDisciplinaryInput.value,
        ),
        away: parseDisciplinary(
          awayDisciplinaryInput.value,
        ),
      },
      substitutions: {
        home: parseSubstitutions(
          homeSubstitutionsInput.value,
        ),
        away: parseSubstitutions(
          awaySubstitutionsInput.value,
        ),
      },
      lineups: {
        home: {
          teamName: match.homeTeam?.name ?? "",
          manager: homeManagerInput.value.trim(),
          starters: parsePlayers(
            homeStartersInput.value,
          ),
          substitutes: parsePlayers(
            homeSubstitutesInput.value,
          ),
        },
        away: {
          teamName: match.awayTeam?.name ?? "",
          manager: awayManagerInput.value.trim(),
          starters: parsePlayers(
            awayStartersInput.value,
          ),
          substitutes: parsePlayers(
            awaySubstitutesInput.value,
          ),
        },
      },
    };

    return {
      matchId: match.id,
      season: match.season,
      competitionId: match.competitionId,
      reason:
        reasonInput.value.trim()
        || "管理画面から手動補正",
      updatedAt: new Date().toISOString(),
      override,
    };
  }

  function buildMergedOverrideFile() {
    const currentItem = buildCurrentOverrideItem();

    if (!currentItem) {
      return null;
    }

    const otherItems = existingOverrideItems.filter(
      (item) => item.matchId !== currentItem.matchId,
    );

    return {
      schemaVersion: 1,
      items: [
        ...otherItems,
        currentItem,
      ],
    };
  }

  function validateCurrentOverride() {
    const item = buildCurrentOverrideItem();

    if (!item) {
      return ["対象試合を選択してください。"];
    }

    const override = item.override;
    const errors = [];

    const homeScore = override.homeTeam?.score;
    const awayScore = override.awayTeam?.score;

    if (
      override.status === "finished"
      && (homeScore == null || awayScore == null)
    ) {
      errors.push(
        "試合終了の場合は、両チームの得点を入力してください。",
      );
    }

    const periods = override.scoreByPeriod ?? [];
    const periodValues = periods.flatMap((period) => [
      period.home,
      period.away,
    ]);

    const enteredPeriodCount = periodValues.filter(
      (value) => value != null,
    ).length;

    if (
      enteredPeriodCount > 0
      && enteredPeriodCount < periodValues.length
    ) {
      errors.push(
        "前半・後半スコアは、ホームとアウェーをすべて入力してください。",
      );
    }

    if (
      enteredPeriodCount === periodValues.length
      && homeScore != null
      && awayScore != null
    ) {
      const periodHomeTotal = periods.reduce(
        (total, period) => total + period.home,
        0,
      );

      const periodAwayTotal = periods.reduce(
        (total, period) => total + period.away,
        0,
      );

      if (periodHomeTotal !== homeScore) {
        errors.push(
          `ホームの前半・後半合計${periodHomeTotal}点と最終得点${homeScore}点が一致しません。`,
        );
      }

      if (periodAwayTotal !== awayScore) {
        errors.push(
          `アウェーの前半・後半合計${periodAwayTotal}点と最終得点${awayScore}点が一致しません。`,
        );
      }
    }

    const homeStarters =
      override.lineups?.home?.starters ?? [];
    const awayStarters =
      override.lineups?.away?.starters ?? [];

    const hasLineupData =
      homeStarters.length > 0
      || awayStarters.length > 0;

    const match = selectedMatch();
    const keepsOfficialHomeCount =
      match?.source?.provider === "football-system.jp"
      && match.status === "finished"
      && match.lineups?.home?.starters?.length > 0
      && match.lineups.home.starters.length !== 11
      && homeStarters.length === match.lineups.home.starters.length;
    const keepsOfficialAwayCount =
      match?.source?.provider === "football-system.jp"
      && match.status === "finished"
      && match.lineups?.away?.starters?.length > 0
      && match.lineups.away.starters.length !== 11
      && awayStarters.length === match.lineups.away.starters.length;

    if (hasLineupData && homeStarters.length !== 11 && !keepsOfficialHomeCount) {
      errors.push(
        `ホームの先発は11人必要です。現在は${homeStarters.length}人です。`,
      );
    }

    if (hasLineupData && awayStarters.length !== 11 && !keepsOfficialAwayCount) {
      errors.push(
        `アウェーの先発は11人必要です。現在は${awayStarters.length}人です。`,
      );
    }

    if (
      override.wasResumed
      && !override.resumedDate
    ) {
      errors.push(
        "再開試合に設定した場合は、再開日を入力してください。",
      );
    }

    errors.push(
      ...validateNumberInputs([
        {
          control: homeScoreInput,
          label: "ホーム得点",
        },
        {
          control: awayScoreInput,
          label: "アウェー得点",
        },
        {
          control: attendanceInput,
          label: "観客数",
        },
        {
          control: firstHalfHomeInput,
          label: "前半ホーム得点",
        },
        {
          control: firstHalfAwayInput,
          label: "前半アウェー得点",
        },
        {
          control: secondHalfHomeInput,
          label: "後半ホーム得点",
        },
        {
          control: secondHalfAwayInput,
          label: "後半アウェー得点",
        },
        {
          control: homeShotsInput,
          label: "ホームのシュート数",
        },
        {
          control: awayShotsInput,
          label: "アウェーのシュート数",
        },
        {
          control: homeGoalKicksInput,
          label: "ホームのゴールキック",
        },
        {
          control: awayGoalKicksInput,
          label: "アウェーのゴールキック",
        },
        {
          control: homeCornerKicksInput,
          label: "ホームのコーナーキック",
        },
        {
          control: awayCornerKicksInput,
          label: "アウェーのコーナーキック",
        },
        {
          control: homeDirectFreeKicksInput,
          label: "ホームの直接フリーキック",
        },
        {
          control: awayDirectFreeKicksInput,
          label: "アウェーの直接フリーキック",
        },
        {
          control: homeIndirectFreeKicksInput,
          label: "ホームの間接フリーキック",
        },
        {
          control: awayIndirectFreeKicksInput,
          label: "アウェーの間接フリーキック",
        },
        {
          control: homeOffsidesInput,
          label: "ホームのオフサイド",
        },
        {
          control: awayOffsidesInput,
          label: "アウェーのオフサイド",
        },
        {
          control: homePenaltiesInput,
          label: "ホームのPK",
        },
        {
          control: awayPenaltiesInput,
          label: "アウェーのPK",
        },
      ]),
      ...validateGoalInput(
        goalsInput.value,
        selectedMatch(),
      ),
      ...validateGoalCount(
        goalsInput.value,
        selectedMatch(),
        homeScore,
        awayScore,
      ),
      ...validateDisciplinaryInput(
        homeDisciplinaryInput.value,
        "ホームの警告・退場",
      ),
      ...validateDisciplinaryInput(
        awayDisciplinaryInput.value,
        "アウェーの警告・退場",
      ),
      ...validatePlayerInput(
        homeStartersInput.value,
        "ホームの先発",
      ),
      ...validatePlayerInput(
        awayStartersInput.value,
        "アウェーの先発",
      ),
      ...validatePlayerInput(
        homeSubstitutesInput.value,
        "ホームの控え",
      ),
      ...validatePlayerInput(
        awaySubstitutesInput.value,
        "アウェーの控え",
      ),
      ...validateSubstitutionInput(
        homeSubstitutionsInput.value,
        "ホームの交代",
      ),
      ...validateSubstitutionInput(
        awaySubstitutionsInput.value,
        "アウェーの交代",
      ),
      ...validateTeamPlayerDuplicates(
        homeStartersInput.value,
        homeSubstitutesInput.value,
        "ホーム",
      ),
      ...validateTeamPlayerDuplicates(
        awayStartersInput.value,
        awaySubstitutesInput.value,
        "アウェー",
      ),
      ...validateSubstitutionPlayers(
        homeSubstitutionsInput.value,
        homeStartersInput.value,
        homeSubstitutesInput.value,
        "ホーム",
      ),
      ...validateSubstitutionPlayers(
        awaySubstitutionsInput.value,
        awayStartersInput.value,
        awaySubstitutesInput.value,
        "アウェー",
      ),
      ...validateSubstitutionFlow(
        homeSubstitutionsInput.value,
        homeStartersInput.value,
        homeSubstitutesInput.value,
        "ホーム",
      ),
      ...validateSubstitutionFlow(
        awaySubstitutionsInput.value,
        awayStartersInput.value,
        awaySubstitutesInput.value,
        "アウェー",
      ),
      ...validateGoalPlayers(
        goalsInput.value,
        selectedMatch(),
        homeStartersInput.value,
        homeSubstitutesInput.value,
        awayStartersInput.value,
        awaySubstitutesInput.value,
      ),
      ...validateDisciplinaryPlayers(
        homeDisciplinaryInput.value,
        homeStartersInput.value,
        homeSubstitutesInput.value,
        "ホーム",
      ),
      ...validateDisciplinaryPlayers(
        awayDisciplinaryInput.value,
        awayStartersInput.value,
        awaySubstitutesInput.value,
        "アウェー",
      ),
      ...validateDuplicateEventLines(
        goalsInput.value,
        "得点欄",
      ),
      ...validateDuplicateEventLines(
        homeDisciplinaryInput.value,
        "ホームの警告・退場",
      ),
      ...validateDuplicateEventLines(
        awayDisciplinaryInput.value,
        "アウェーの警告・退場",
      ),
      ...validateDuplicateEventLines(
        homeSubstitutionsInput.value,
        "ホームの交代",
      ),
      ...validateDuplicateEventLines(
        awaySubstitutionsInput.value,
        "アウェーの交代",
      ),
    );

    return errors;
  }

  function clearValidationHighlights() {
    for (const control of [
      statusSelect,
      homeScoreInput,
      awayScoreInput,
      resumedDateInput,
      firstHalfHomeInput,
      firstHalfAwayInput,
      secondHalfHomeInput,
      secondHalfAwayInput,
      goalsInput,
      homeDisciplinaryInput,
      awayDisciplinaryInput,
      homeSubstitutionsInput,
      awaySubstitutionsInput,
      homeStartersInput,
      awayStartersInput,
      homeSubstitutesInput,
      awaySubstitutesInput,
    ]) {
      control.style.outline = "";
      control.style.outlineOffset = "";
      control.style.backgroundColor = "";
      control.removeAttribute("aria-invalid");
      control.removeAttribute("title");
    }
  }

  function markInvalidControls(
    controls,
    message,
  ) {
    for (const control of controls) {
      control.style.outline =
        "2px solid crimson";
      control.style.outlineOffset = "2px";
      control.style.backgroundColor =
        "rgba(220, 20, 60, 0.06)";
      control.setAttribute(
        "aria-invalid",
        "true",
      );
      control.setAttribute(
        "title",
        message,
      );
    }
  }

  function applyValidationHighlights(errors) {
    clearValidationHighlights();

    const match = selectedMatch();
    const homeTeamName =
      match?.homeTeam?.name ?? "";
    const awayTeamName =
      match?.awayTeam?.name ?? "";

    for (const error of errors) {
      const numberControlMap = [
        ["ホーム得点は", homeScoreInput],
        ["アウェー得点は", awayScoreInput],
        ["観客数は", attendanceInput],
        ["前半ホーム得点は", firstHalfHomeInput],
        ["前半アウェー得点は", firstHalfAwayInput],
        ["後半ホーム得点は", secondHalfHomeInput],
        ["後半アウェー得点は", secondHalfAwayInput],
        ["ホームのシュート数は", homeShotsInput],
        ["アウェーのシュート数は", awayShotsInput],
        ["ホームのゴールキックは", homeGoalKicksInput],
        ["アウェーのゴールキックは", awayGoalKicksInput],
        ["ホームのコーナーキックは", homeCornerKicksInput],
        ["アウェーのコーナーキックは", awayCornerKicksInput],
        ["ホームの直接フリーキックは", homeDirectFreeKicksInput],
        ["アウェーの直接フリーキックは", awayDirectFreeKicksInput],
        ["ホームの間接フリーキックは", homeIndirectFreeKicksInput],
        ["アウェーの間接フリーキックは", awayIndirectFreeKicksInput],
        ["ホームのオフサイドは", homeOffsidesInput],
        ["アウェーのオフサイドは", awayOffsidesInput],
        ["ホームのPKは", homePenaltiesInput],
        ["アウェーのPKは", awayPenaltiesInput],
      ];

      for (const [prefix, control] of numberControlMap) {
        if (error.startsWith(prefix)) {
          markInvalidControls(
            [control],
            error,
          );
        }
      }

      if (
        error.includes("試合終了の場合")
      ) {
        markInvalidControls(
          [
            statusSelect,
            homeScoreInput,
            awayScoreInput,
          ],
          error,
        );
      }

      if (
        error.includes("前半・後半スコア")
      ) {
        markInvalidControls(
          [
            firstHalfHomeInput,
            firstHalfAwayInput,
            secondHalfHomeInput,
            secondHalfAwayInput,
          ],
          error,
        );
      }

      if (
        error.includes("ホームの前半・後半合計")
      ) {
        markInvalidControls(
          [
            homeScoreInput,
            firstHalfHomeInput,
            secondHalfHomeInput,
          ],
          error,
        );
      }

      if (
        error.includes("アウェーの前半・後半合計")
      ) {
        markInvalidControls(
          [
            awayScoreInput,
            firstHalfAwayInput,
            secondHalfAwayInput,
          ],
          error,
        );
      }

      if (
        error.includes("再開日")
      ) {
        markInvalidControls(
          [resumedDateInput],
          error,
        );
      }

      if (
        error.includes("得点欄")
        || error.includes("ホームの最終得点")
        || error.includes("アウェーの最終得点")
      ) {
        markInvalidControls(
          [goalsInput],
          error,
        );
      }

      if (
        error.includes("ホームの最終得点")
      ) {
        markInvalidControls(
          [homeScoreInput],
          error,
        );
      }

      if (
        error.includes("アウェーの最終得点")
      ) {
        markInvalidControls(
          [awayScoreInput],
          error,
        );
      }

      if (
        error.includes("ホームの警告・退場")
      ) {
        markInvalidControls(
          [homeDisciplinaryInput],
          error,
        );
      }

      if (
        error.includes("アウェーの警告・退場")
      ) {
        markInvalidControls(
          [awayDisciplinaryInput],
          error,
        );
      }

      if (
        error.includes("ホームの交代")
      ) {
        markInvalidControls(
          [homeSubstitutionsInput],
          error,
        );
      }

      if (
        error.includes("アウェーの交代")
      ) {
        markInvalidControls(
          [awaySubstitutionsInput],
          error,
        );
      }

      if (
        error.includes("ホームの先発")
      ) {
        markInvalidControls(
          [homeStartersInput],
          error,
        );
      }

      if (
        error.includes("アウェーの先発")
      ) {
        markInvalidControls(
          [awayStartersInput],
          error,
        );
      }

      if (
        error.includes("ホームの控え")
      ) {
        markInvalidControls(
          [homeSubstitutesInput],
          error,
        );
      }

      if (
        error.includes("アウェーの控え")
      ) {
        markInvalidControls(
          [awaySubstitutesInput],
          error,
        );
      }

      if (
        error.startsWith("ホームで背番号")
        || error.startsWith("ホームで選手名")
      ) {
        markInvalidControls(
          [
            homeStartersInput,
            homeSubstitutesInput,
          ],
          error,
        );
      }

      if (
        error.startsWith("アウェーで背番号")
        || error.startsWith("アウェーで選手名")
      ) {
        markInvalidControls(
          [
            awayStartersInput,
            awaySubstitutesInput,
          ],
          error,
        );
      }

      if (
        homeTeamName
        && error.includes(
          `${homeTeamName}の先発・控え`,
        )
      ) {
        markInvalidControls(
          [
            homeStartersInput,
            homeSubstitutesInput,
          ],
          error,
        );
      }

      if (
        awayTeamName
        && error.includes(
          `${awayTeamName}の先発・控え`,
        )
      ) {
        markInvalidControls(
          [
            awayStartersInput,
            awaySubstitutesInput,
          ],
          error,
        );
      }
    }
  }

  function openGroupsWithErrors() {
    for (const group of [
      basicInformationGroup,
      scoreGroup,
      eventGroup,
      lineupGroup,
      statisticsGroup,
    ]) {
      if (
        group.querySelector(
          '[aria-invalid="true"]',
        )
      ) {
        group.open = true;
      }
    }
  }

  function updateValidationStatus() {
    const errors = validateCurrentOverride();

    applyValidationHighlights(errors);
    openGroupsWithErrors();

    if (errors.length) {
      validationStatus.textContent =
        "入力エラー：\n"
        + errors.map(
          (error, index) => `${index + 1}. ${error}`,
        ).join("\n");

      validationStatus.style.whiteSpace = "pre-wrap";
      validationStatus.style.color = "crimson";
      return errors;
    }

    validationStatus.textContent =
      "入力内容に問題はありません。";
    validationStatus.style.whiteSpace = "normal";
    validationStatus.style.color = "";

    return [];
  }

  function updatePreview() {
    if (overrideLoadStatus === "loading") {
      preview.textContent =
        "既存の補正データを読み込んでいます…";
      return;
    }

    const file = buildMergedOverrideFile();

    preview.textContent = file
      ? JSON.stringify(file, null, 2)
      : "補正内容はまだありません。";

    updateValidationStatus();
  }

  const draftControlMap = {
    status: statusSelect,
    homeScore: homeScoreInput,
    awayScore: awayScoreInput,
    venue: venueInput,
    attendance: attendanceInput,
    matchFormat: matchFormatInput,
    weather: weatherInput,
    wind: windInput,
    pitch: pitchInput,
    officials: officialsInput,
    homeShots: homeShotsInput,
    awayShots: awayShotsInput,
    homeGoalKicks: homeGoalKicksInput,
    awayGoalKicks: awayGoalKicksInput,
    homeCornerKicks: homeCornerKicksInput,
    awayCornerKicks: awayCornerKicksInput,
    homeDirectFreeKicks:
      homeDirectFreeKicksInput,
    awayDirectFreeKicks:
      awayDirectFreeKicksInput,
    homeIndirectFreeKicks:
      homeIndirectFreeKicksInput,
    awayIndirectFreeKicks:
      awayIndirectFreeKicksInput,
    homeOffsides: homeOffsidesInput,
    awayOffsides: awayOffsidesInput,
    homePenalties: homePenaltiesInput,
    awayPenalties: awayPenaltiesInput,
    notes: notesInput,
    reason: reasonInput,
    resumedDate: resumedDateInput,
    firstHalfHome: firstHalfHomeInput,
    firstHalfAway: firstHalfAwayInput,
    secondHalfHome: secondHalfHomeInput,
    secondHalfAway: secondHalfAwayInput,
    goals: goalsInput,
    homeDisciplinary:
      homeDisciplinaryInput,
    awayDisciplinary:
      awayDisciplinaryInput,
    homeSubstitutions:
      homeSubstitutionsInput,
    awaySubstitutions:
      awaySubstitutionsInput,
    homeManager: homeManagerInput,
    awayManager: awayManagerInput,
    homeStarters: homeStartersInput,
    awayStarters: awayStartersInput,
    homeSubstitutes:
      homeSubstitutesInput,
    awaySubstitutes:
      awaySubstitutesInput,
  };

  function createDraftStorageKey() {
    const competition = selectedCompetition();
    if (!matchSelect.value || !competition) {
      return null;
    }

    return (
      "chugoku-football-admin-draft:"
      + competition.season
      + ":"
      + competition.id
      + ":"
      + matchSelect.value
    );
  }

  function createLegacyDraftStorageKey() {
    return matchSelect.value
      ? `chugoku-football-admin-draft:${matchSelect.value}`
      : null;
  }

  function saveDraft() {
    const storageKey =
      createDraftStorageKey();

    if (!storageKey) {
      return;
    }

    const values = {};

    for (
      const [key, control]
      of Object.entries(draftControlMap)
    ) {
      values[key] = control.value;
    }

    const draft = {
      matchId: matchSelect.value,
      season: selectedCompetition()?.season,
      competitionId: selectedCompetition()?.id,
      savedAt: new Date().toISOString(),
      resumed: resumedCheckbox.checked,
      values,
    };

    localStorage.setItem(
      storageKey,
      JSON.stringify(draft),
    );

    draftStatus.textContent =
      "入力内容をブラウザへ自動保存しました。";

    clearDraftButton.disabled = false;
  }

  function restoreDraft() {
    const storageKey =
      createDraftStorageKey();

    if (!storageKey) {
      clearDraftButton.disabled = true;
      draftStatus.textContent =
        "下書きはまだありません。";
      return false;
    }

    const rawDraft = localStorage.getItem(storageKey)
      ?? localStorage.getItem(createLegacyDraftStorageKey());

    if (!rawDraft) {
      clearDraftButton.disabled = true;
      draftStatus.textContent =
        "この試合の下書きはありません。";
      return false;
    }

    try {
      const draft = JSON.parse(rawDraft);

      for (
        const [key, control]
        of Object.entries(draftControlMap)
      ) {
        if (
          Object.prototype.hasOwnProperty.call(
            draft.values ?? {},
            key,
          )
        ) {
          control.value =
            draft.values[key] ?? "";
        }
      }

      resumedCheckbox.checked =
        Boolean(draft.resumed);

      resumedDateInput.disabled =
        !resumedCheckbox.checked;

      clearDraftButton.disabled = false;

      const savedDate = draft.savedAt
        ? new Date(draft.savedAt)
            .toLocaleString("ja-JP")
        : "時刻不明";

      draftStatus.textContent =
        `下書きを復元しました（${savedDate}）。`;

      updatePreview();

      return true;
    } catch {
      draftStatus.textContent =
        "下書きの読み込みに失敗しました。";

      clearDraftButton.disabled = false;

      return false;
    }
  }

  function deleteCurrentDraft() {
    const storageKey =
      createDraftStorageKey();

    if (!storageKey) {
      return;
    }

    localStorage.removeItem(storageKey);
    localStorage.removeItem(createLegacyDraftStorageKey());

    clearDraftButton.disabled = true;

    draftStatus.textContent =
      "この試合の下書きを削除しました。";
  }

  matchSelect.addEventListener(
    "change",
    async () => {
      await updateFormFromMatch();
      restoreDraft();
      hasUnsavedChanges = false;
    },
  );

  let activeSeason = seasonSelect.value;
  let activeCompetition = competitionSelect.value;

  function confirmCompetitionChange() {
    return !hasUnsavedChanges || window.confirm(
      "未保存の変更があります。大会を切り替えると入力内容が失われます。",
    );
  }

  seasonSelect.addEventListener("change", () => {
    if (!confirmCompetitionChange()) {
      seasonSelect.value = activeSeason;
      return;
    }
    activeSeason = seasonSelect.value;
    updateCompetitionOptions();
    activeCompetition = competitionSelect.value;
    updateMatchOptions();
    updateFormFromMatch();
    hasUnsavedChanges = false;
  });

  competitionSelect.addEventListener("change", () => {
    if (!confirmCompetitionChange()) {
      competitionSelect.value = activeCompetition;
      return;
    }
    activeCompetition = competitionSelect.value;
    updateMatchOptions();
    updateFormFromMatch();
    hasUnsavedChanges = false;
  });

  for (const control of [
    statusSelect,
    homeScoreInput,
    awayScoreInput,
    venueInput,
    attendanceInput,
    matchFormatInput,
    weatherInput,
    windInput,
    pitchInput,
    officialsInput,
    homeShotsInput,
    awayShotsInput,
    homeGoalKicksInput,
    awayGoalKicksInput,
    homeCornerKicksInput,
    awayCornerKicksInput,
    homeDirectFreeKicksInput,
    awayDirectFreeKicksInput,
    homeIndirectFreeKicksInput,
    awayIndirectFreeKicksInput,
    homeOffsidesInput,
    awayOffsidesInput,
    homePenaltiesInput,
    awayPenaltiesInput,
    notesInput,
    reasonInput,
    resumedDateInput,
    firstHalfHomeInput,
    firstHalfAwayInput,
    secondHalfHomeInput,
    secondHalfAwayInput,
    goalsInput,
    homeDisciplinaryInput,
    awayDisciplinaryInput,
    homeSubstitutionsInput,
    awaySubstitutionsInput,
    homeManagerInput,
    awayManagerInput,
    homeStartersInput,
    awayStartersInput,
    homeSubstitutesInput,
    awaySubstitutesInput,
  ]) {
    control.addEventListener("input", () => {
      hasUnsavedChanges = true;
      updatePreview();
      saveDraft();
    });

    control.addEventListener("change", () => {
      hasUnsavedChanges = true;
      updatePreview();
      saveDraft();
    });
  }

  resumedCheckbox.addEventListener("change", () => {
    hasUnsavedChanges = true;
    resumedDateInput.disabled =
      !resumedCheckbox.checked;

    if (!resumedCheckbox.checked) {
      resumedDateInput.value = "";
    }

    updatePreview();
    saveDraft();
  });

  clearDraftButton.addEventListener(
    "click",
    async () => {
      const shouldDelete = window.confirm(
        "この試合のブラウザ下書きを削除しますか？"
      );

      if (!shouldDelete) {
        return;
      }

      deleteCurrentDraft();
      await updateFormFromMatch();
      updatePreview();
    },
  );

  downloadButton.addEventListener("click", () => {
    if (overrideLoadStatus === "loading") {
      return;
    }

    const errors = updateValidationStatus();

    if (errors.length) {
      validationStatus.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }

    const file = buildMergedOverrideFile();

    if (!file) {
      return;
    }

    const currentItem =
      buildCurrentOverrideItem();

    const match = selectedMatch();
    const competition = selectedCompetition();

    if (!competition || match?.competitionId !== competition.id) {
      validationStatus.textContent = "選択中の大会と試合の保存先が一致しないため、出力を停止しました。";
      validationStatus.style.color = "crimson";
      return;
    }

    const homeStarterCount =
      currentItem?.override?.lineups
        ?.home?.starters?.length ?? 0;

    const awayStarterCount =
      currentItem?.override?.lineups
        ?.away?.starters?.length ?? 0;

    const goalCount =
      currentItem?.override?.goals
        ?.length ?? 0;

    const substitutionCount =
      (
        currentItem?.override
          ?.substitutions?.home?.length ?? 0
      )
      + (
        currentItem?.override
          ?.substitutions?.away?.length ?? 0
      );

    const confirmationMessage = [
      "次の内容で補正JSONを作成します。",
      "",
      `年度：${competition.season}`,
      `大会：${createCompetitionLabel(competition)}`,
      `試合：${match?.homeTeam?.name ?? ""} vs ${match?.awayTeam?.name ?? ""}`,
      `出力先：${competition.season}年 ${createCompetitionLabel(competition)}の手動補正`,
      `スコア：${homeScoreInput.value || "未入力"} - ${awayScoreInput.value || "未入力"}`,
      `先発人数：${homeStarterCount}人 / ${awayStarterCount}人`,
      `得点記録：${goalCount}件`,
      `交代記録：${substitutionCount}件`,
      `補正ファイル全体：${file.items.length}試合分`,
      "",
      "ダウンロードしてよろしいですか？",
    ].join("\n");

    if (
      !window.confirm(
        confirmationMessage,
      )
    ) {
      return;
    }

    const blob = new Blob(
      [JSON.stringify(file, null, 2) + "\n"],
      { type: "application/json" },
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = createOverrideDownloadName(competition);
    link.click();

    URL.revokeObjectURL(url);
    hasUnsavedChanges = false;
  });

  const basicInformationGroup =
    createAdminGroup(
      "基本情報",
      "会場・天候・審判・備考",
      [
        createField("対象試合", matchSelect),
        createField("試合状態", statusSelect),
        createField("試合会場", venueInput),
        createField("観客数", attendanceInput),
        createField("試合形式", matchFormatInput),
        createField("天候", weatherInput),
        createField("風", windInput),
        createField("ピッチ", pitchInput),
        createField("審判・運営", officialsInput),
        createField("備考", notesInput),
        createField("補正理由", reasonInput),
      ],
      true,
    );

  const scoreGroup = createAdminGroup(
    "スコア・再開試合",
    "最終結果と前半・後半",
    [
      createField(
        "ホーム得点",
        homeScoreInput,
      ),
      createField(
        "アウェー得点",
        awayScoreInput,
      ),
      createField(
        "再開試合",
        element("label", {
          className: "admin-checkbox-label",
        }, [
          resumedCheckbox,
          element("span", {
            text: "中断後に再開した試合",
          }),
        ]),
      ),
      createField(
        "再開日",
        resumedDateInput,
      ),
      createField(
        "前半スコア",
        createScoreInputs(
          firstHalfHomeInput,
          firstHalfAwayInput,
        ),
      ),
      createField(
        "後半スコア",
        createScoreInputs(
          secondHalfHomeInput,
          secondHalfAwayInput,
        ),
      ),
    ],
    true,
  );

  const eventGroup = createAdminGroup(
    "得点・交代・警告",
    "試合中のイベント",
    [
      createField("得点", goalsInput),
      createField(
        "ホーム警告・退場",
        homeDisciplinaryInput,
      ),
      createField(
        "アウェー警告・退場",
        awayDisciplinaryInput,
      ),
      createField(
        "ホーム交代",
        homeSubstitutionsInput,
      ),
      createField(
        "アウェー交代",
        awaySubstitutionsInput,
      ),
    ],
    false,
  );

  const lineupGroup = createAdminGroup(
    "監督・選手",
    "先発・控えメンバー",
    [
      createField(
        "ホーム監督",
        homeManagerInput,
      ),
      createField(
        "アウェー監督",
        awayManagerInput,
      ),
      createField(
        "ホーム先発",
        homeStartersInput,
      ),
      createField(
        "アウェー先発",
        awayStartersInput,
      ),
      createField(
        "ホーム控え",
        homeSubstitutesInput,
      ),
      createField(
        "アウェー控え",
        awaySubstitutesInput,
      ),
    ],
    false,
  );

  const statisticsGroup = createAdminGroup(
    "チームスタッツ",
    "試合合計",
    [
      createField(
        "シュート数",
        createScoreInputs(
          homeShotsInput,
          awayShotsInput,
        ),
      ),
      createField(
        "ゴールキック",
        createScoreInputs(
          homeGoalKicksInput,
          awayGoalKicksInput,
        ),
      ),
      createField(
        "コーナーキック",
        createScoreInputs(
          homeCornerKicksInput,
          awayCornerKicksInput,
        ),
      ),
      createField(
        "直接フリーキック",
        createScoreInputs(
          homeDirectFreeKicksInput,
          awayDirectFreeKicksInput,
        ),
      ),
      createField(
        "間接フリーキック",
        createScoreInputs(
          homeIndirectFreeKicksInput,
          awayIndirectFreeKicksInput,
        ),
      ),
      createField(
        "オフサイド",
        createScoreInputs(
          homeOffsidesInput,
          awayOffsidesInput,
        ),
      ),
      createField(
        "PK",
        createScoreInputs(
          homePenaltiesInput,
          awayPenaltiesInput,
        ),
      ),
    ],
    false,
  );

  const form = element("div", {
    className: "admin-form-groups",
  }, [
    basicInformationGroup,
    scoreGroup,
    eventGroup,
    lineupGroup,
    statisticsGroup,
  ]);

  return element("article", {
    className: "page",
    attributes: {
      "data-page": "admin",
    },
  }, [
    createPageHeader({
      eyebrow: "Manual Override",
      title: "試合データ補正",
      description:
        "既存の補正を残したまま、試合結果を追加・更新します。",
      badge: "管理用",
    }),
    element("div", {
      className: "section-stack",
    }, [
      createNotice(
        "試合を選ぶと既存の補正ファイルを読み込み、内容を統合したJSONを作成します。",
      ),
      createPanel(
        "編集対象",
        element("div", { className: "admin-save-status" }, [
          createField("年度選択", seasonSelect),
          createField("大会選択", competitionSelect),
          editTarget,
          saveTarget,
          competitionStatus,
        ]),
        "年度・大会",
      ),
      createPanel(
        "基本情報",
        form,
        "手動補正",
      ),
      createPanel(
        "保存先",
        element("div", {
          className: "admin-save-status",
        }, [
          destination,
          existingStatus,
          draftStatus,
          validationStatus,
          clearDraftButton,
        ]),
        "配置先",
      ),
      createPanel(
        "統合後の出力内容",
        preview,
        "JSONプレビュー",
      ),
      downloadButton,
    ]),
  ]);
}

function createAdminGroup(
  title,
  description,
  fields,
  opened = false,
) {
  return element("details", {
    className: "admin-form-group",
    attributes: opened
      ? { open: "" }
      : {},
  }, [
    element("summary", {
      className: "admin-form-group__summary",
    }, [
      element("span", {
        className: "admin-form-group__title",
        text: title,
      }),
      element("span", {
        className:
          "admin-form-group__description",
        text: description,
      }),
    ]),
    element("div", {
      className:
        "detail-list admin-form-group__body",
    }, fields),
  ]);
}

function createField(label, control) {
  return element("label", {
    className: "detail-row",
  }, [
    element("span", { text: label }),
    element("div", {}, [control]),
  ]);
}

function createTextInput(placeholder = "") {
  return element("input", {
    className: "admin-input",
    attributes: {
      type: "text",
      placeholder,
    },
  });
}

function createScoreInputs(homeInput, awayInput) {
  return element("div", {
    className: "admin-score-inputs",
  }, [
    element("label", {}, [
      element("span", { text: "ホーム" }),
      homeInput,
    ]),
    element("span", { text: "-" }),
    element("label", {}, [
      element("span", { text: "アウェー" }),
      awayInput,
    ]),
  ]);
}

function createTextarea(placeholder, rows = 5) {
  return element("textarea", {
    className: "admin-input admin-input--textarea",
    attributes: {
      rows: String(rows),
      placeholder,
    },
  });
}

function createNumberInput() {
  return element("input", {
    className: "admin-input",
    attributes: {
      type: "number",
      min: "0",
      step: "1",
      inputmode: "numeric",
    },
  });
}

function createOption(value, label) {
  return element("option", {
    text: label,
    attributes: { value },
  });
}

function parseNullableNumber(value) {
  if (value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function createMatchOptionLabel(match) {
  const date = new Intl.DateTimeFormat(
    "ja-JP",
    {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
  ).format(new Date(match.kickoffAt));

  return [
    match.season,
    match.division != null
      ? `${match.division}部`
      : match.stageName,
    match.roundLabel ?? `第${match.round}節`,
    date,
    `${match.homeTeam.name} vs ${match.awayTeam.name}`,
  ].join(" / ");
}

function formatOfficialsForInput(officials) {
  return officials.map((official) => [
    official.role ?? "",
    official.name ?? "",
  ].join("|")).join("\n");
}

function parseOfficials(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [
        role = "",
        name = "",
      ] = line
        .split("|")
        .map((part) => part.trim());

      return { role, name };
    })
    .filter((official) =>
      official.role && official.name
    );
}

function formatNotesForInput(notes, statusNote) {
  if (Array.isArray(notes) && notes.length) {
    return notes.join("\n");
  }

  return statusNote ?? "";
}

function parseNotes(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatGoalsForInput(goals) {
  return goals.map((goal) => [
    goal.minuteLabel ?? goal.minute ?? "",
    goal.teamName ?? "",
    goal.scorerNumber ?? "",
    goal.scorerName ?? "",
    (goal.assistNames ?? []).join("、"),
  ].join("|")).join("\n");
}

function validateNumberInputs(items) {
  const errors = [];

  for (const item of items) {
    const value = item.control.value.trim();

    if (value === "") {
      continue;
    }

    const number = Number(value);

    if (
      !Number.isFinite(number)
      || !Number.isInteger(number)
      || number < 0
    ) {
      errors.push(
        `${item.label}は0以上の整数で入力してください。`,
      );
    }
  }

  return errors;
}

function nonEmptyInputLines(value) {
  return value
    .split("\n")
    .map((line, index) => ({
      number: index + 1,
      text: line.trim(),
    }))
    .filter((line) => line.text);
}

function isValidMinuteInput(value, allowHalfTime = false) {
  const normalized = String(value)
    .normalize("NFKC")
    .trim()
    .replace(/\s*\+\s*/g, "+")
    .replace(/\s+/g, "")
    .toUpperCase();

  if (allowHalfTime && normalized === "HT") {
    return true;
  }

  const match = normalized.match(
    /^(\d+)(?:\+(\d+))?$/,
  );

  if (!match) {
    return false;
  }

  const regularMinute = Number(match[1]);
  const addedMinute = Number(match[2] ?? 0);

  return (
    Number.isInteger(regularMinute)
    && Number.isInteger(addedMinute)
    && regularMinute >= 0
    && regularMinute <= 130
    && addedMinute >= 0
    && addedMinute <= 30
  );
}

function isValidPlayerNumber(value) {
  const normalized = String(value).trim();

  if (!/^\d+$/.test(normalized)) {
    return false;
  }

  const number = Number(normalized);

  return (
    Number.isInteger(number)
    && number >= 1
    && number <= 999
  );
}

function validateGoalInput(value, match) {
  const errors = [];
  const allowedTeams = [
    match?.homeTeam?.name,
    match?.awayTeam?.name,
  ].filter(Boolean);

  for (const line of nonEmptyInputLines(value)) {
    const parts = line.text
      .split("|")
      .map((part) => part.trim());

    if (parts.length !== 5) {
      errors.push(
        `得点欄${line.number}行目は「時間|チーム名|背番号|得点者|アシスト」の5項目で入力してください。`,
      );
      continue;
    }

    const [
      minute,
      teamName,
      scorerNumber,
      scorerName,
    ] = parts;

    if (!isValidMinuteInput(minute)) {
      errors.push(
        `得点欄${line.number}行目の時間「${minute}」が正しくありません。例：35、45+2`,
      );
    }

    if (!teamName) {
      errors.push(
        `得点欄${line.number}行目のチーム名が空欄です。`,
      );
    } else if (
      allowedTeams.length
      && !allowedTeams.includes(teamName)
    ) {
      errors.push(
        `得点欄${line.number}行目のチーム名「${teamName}」が対戦チーム名と一致しません。`,
      );
    }

    if (
      scorerNumber
      && !isValidPlayerNumber(scorerNumber)
    ) {
      errors.push(
        `得点欄${line.number}行目の背番号「${scorerNumber}」は数字で入力してください。`,
      );
    }

    if (!scorerName) {
      errors.push(
        `得点欄${line.number}行目の得点者が空欄です。`,
      );
    }
  }

  return errors;
}

function validateGoalCount(
  value,
  match,
  homeScore,
  awayScore,
) {
  const errors = [];

  if (
    homeScore == null
    || awayScore == null
    || !match
  ) {
    return errors;
  }

  const validLines = nonEmptyInputLines(value)
    .map((line) =>
      line.text
        .split("|")
        .map((part) => part.trim())
    )
    .filter((parts) => parts.length === 5);

  const homeTeamName =
    match.homeTeam?.name ?? "";
  const awayTeamName =
    match.awayTeam?.name ?? "";

  const homeGoals = validLines.filter(
    (parts) => parts[1] === homeTeamName,
  ).length;

  const awayGoals = validLines.filter(
    (parts) => parts[1] === awayTeamName,
  ).length;

  if (homeGoals !== homeScore) {
    errors.push(
      `ホームの最終得点は${homeScore}点ですが、得点欄は${homeGoals}件です。`,
    );
  }

  if (awayGoals !== awayScore) {
    errors.push(
      `アウェーの最終得点は${awayScore}点ですが、得点欄は${awayGoals}件です。`,
    );
  }

  return errors;
}

function parseDisciplinaryLineForValidation(value) {
  const text = String(value).trim();

  if (text.includes("|")) {
    const parts = text
      .split("|")
      .map((part) => part.trim());

    if (parts.length !== 4) {
      return {
        valid: false,
        format: "pipe",
      };
    }

    const [
      minute = "",
      type = "",
      playerName = "",
      reason = "",
    ] = parts;

    return {
      valid: true,
      format: "pipe",
      minute,
      type,
      playerName,
      reason,
    };
  }

  const normalizedLegacyText = text
    .normalize("NFKC")
    .replace(/(\d)\s*\+\s*(\d)/g, "$1+$2");

  const legacyMatch = normalizedLegacyText.match(
    /^(\d+(?:\+\d+)?)\s*分\s+(.+?)\s+(C\d+|CS|S\d+|警告|退場)\s*(.*)$/i,
  );

  if (!legacyMatch) {
    return {
      valid: false,
      format: "legacy",
    };
  }

  const [
    ,
    minute = "",
    playerName = "",
    code = "",
    reason = "",
  ] = legacyMatch;

  const normalizedCode = code.toUpperCase();

  return {
    valid: true,
    format: "legacy",
    minute,
    type:
      normalizedCode === "退場"
      || normalizedCode === "CS"
      || normalizedCode.startsWith("S")
        ? "退場"
        : "警告",
    playerName: playerName.trim(),
    reason: [
      code,
      reason,
    ].filter(Boolean).join(" "),
  };
}

function validateDisciplinaryInput(value, label) {
  const errors = [];

  for (const line of nonEmptyInputLines(value)) {
    const parsed =
      parseDisciplinaryLineForValidation(
        line.text,
      );

    if (!parsed.valid) {
      errors.push(
        `${label}${line.number}行目の形式が正しくありません。`
        + "「時間|種類|選手名|理由」または"
        + "「21 分 選手名 C1 反スポーツ」の形式で入力してください。",
      );
      continue;
    }

    if (!isValidMinuteInput(parsed.minute)) {
      errors.push(
        `${label}${line.number}行目の時間「${parsed.minute}」が正しくありません。`,
      );
    }

    if (
      !["警告", "退場"].includes(parsed.type)
    ) {
      errors.push(
        `${label}${line.number}行目の種類は「警告」または「退場」で入力してください。`,
      );
    }

    if (!parsed.playerName) {
      errors.push(
        `${label}${line.number}行目の選手名が空欄です。`,
      );
    }
  }

  return errors;
}

function validatePlayerInput(value, label) {
  const errors = [];

  for (const line of nonEmptyInputLines(value)) {
    const parts = line.text
      .split("|")
      .map((part) => part.trim());

    if (parts.length !== 3) {
      errors.push(
        `${label}${line.number}行目は「ポジション|背番号|選手名」の3項目で入力してください。`,
      );
      continue;
    }

    const [
      position,
      number,
      name,
    ] = parts;

    if (!position) {
      errors.push(
        `${label}${line.number}行目のポジションが空欄です。`,
      );
    }

    if (!number) {
      errors.push(
        `${label}${line.number}行目の背番号が空欄です。`,
      );
    } else if (!isValidPlayerNumber(number)) {
      errors.push(
        `${label}${line.number}行目の背番号「${number}」は、1以上999以下の整数で入力してください。`,
      );
    }

    if (!name) {
      errors.push(
        `${label}${line.number}行目の選手名が空欄です。`,
      );
    }
  }

  return errors;
}

function parsePlayerRowsForValidation(
  startersValue,
  substitutesValue,
) {
  return [
    ...nonEmptyInputLines(startersValue).map((line) => ({
      ...line,
      category: "先発",
    })),
    ...nonEmptyInputLines(substitutesValue).map((line) => ({
      ...line,
      category: "控え",
    })),
  ]
    .map((line) => {
      const [
        position = "",
        number = "",
        name = "",
      ] = line.text
        .split("|")
        .map((part) => part.trim());

      return {
        ...line,
        position,
        number,
        name,
      };
    })
    .filter((player) =>
      player.number || player.name
    );
}

function validateTeamPlayerDuplicates(
  startersValue,
  substitutesValue,
  teamLabel,
) {
  const errors = [];

  const players = parsePlayerRowsForValidation(
    startersValue,
    substitutesValue,
  );

  const numberMap = new Map();
  const nameMap = new Map();

  for (const player of players) {
    if (player.number) {
      const existing = numberMap.get(player.number);

      if (existing) {
        errors.push(
          `${teamLabel}で背番号${player.number}が重複しています。`
          + `${existing.category}${existing.number}行目と`
          + `${player.category}${player.number}行目です。`,
        );
      } else {
        numberMap.set(player.number, player);
      }
    }

    if (player.name) {
      const normalizedName = player.name
        .replace(/[\s　]/g, "");

      const existing = nameMap.get(normalizedName);

      if (existing) {
        errors.push(
          `${teamLabel}で選手名「${player.name}」が重複しています。`
          + `${existing.category}${existing.number}行目と`
          + `${player.category}${player.number}行目です。`,
        );
      } else {
        nameMap.set(normalizedName, player);
      }
    }
  }

  return errors;
}

function normalizePlayerName(value) {
  return String(value)
    .replace(/\s*\[Cap\]\s*$/i, "")
    .replace(/\s*\(Cap\)\s*$/i, "")
    .replace(/\s*［Cap］\s*$/i, "")
    .replace(/[\s　]/g, "")
    .trim();
}

function collectRegisteredPlayerNames(
  startersValue,
  substitutesValue,
) {
  const names = new Set();

  for (const value of [
    startersValue,
    substitutesValue,
  ]) {
    for (const line of nonEmptyInputLines(value)) {
      const parts = line.text
        .split("|")
        .map((part) => part.trim());

      const name = parts[2] ?? "";
      const normalizedName =
        normalizePlayerName(name);

      if (normalizedName) {
        names.add(normalizedName);
      }
    }
  }

  return names;
}

function normalizeEventLine(value) {
  return String(value)
    .split("|")
    .map((part) =>
      part.trim().replace(/[\s　]+/g, " ")
    )
    .join("|")
    .toLowerCase();
}

function validateDuplicateEventLines(
  value,
  label,
) {
  const errors = [];
  const seenLines = new Map();

  for (const line of nonEmptyInputLines(value)) {
    const normalized =
      normalizeEventLine(line.text);

    const previousLine =
      seenLines.get(normalized);

    if (previousLine != null) {
      errors.push(
        `${label}${line.number}行目は、`
        + `${previousLine}行目と同じ内容です。`,
      );
      continue;
    }

    seenLines.set(normalized, line.number);
  }

  return errors;
}

function validateGoalPlayers(
  goalsValue,
  match,
  homeStartersValue,
  homeSubstitutesValue,
  awayStartersValue,
  awaySubstitutesValue,
) {
  const errors = [];

  if (!match) {
    return errors;
  }

  const homeTeamName =
    match.homeTeam?.name ?? "";
  const awayTeamName =
    match.awayTeam?.name ?? "";

  const homeNames = collectRegisteredPlayerNames(
    homeStartersValue,
    homeSubstitutesValue,
  );

  const awayNames = collectRegisteredPlayerNames(
    awayStartersValue,
    awaySubstitutesValue,
  );

  for (const line of nonEmptyInputLines(goalsValue)) {
    const parts = line.text
      .split("|")
      .map((part) => part.trim());

    if (parts.length !== 5) {
      continue;
    }

    const [
      ,
      teamName,
      ,
      scorerName,
      assistsText,
    ] = parts;

    let registeredNames;

    if (teamName === homeTeamName) {
      registeredNames = homeNames;
    } else if (teamName === awayTeamName) {
      registeredNames = awayNames;
    } else {
      continue;
    }

    if (
      scorerName
      && scorerName !== "オウンゴール"
      && registeredNames.size
      && !registeredNames.has(
        normalizePlayerName(scorerName),
      )
    ) {
      errors.push(
        `得点欄${line.number}行目の得点者`
        + `「${scorerName}」が、`
        + `${teamName}の先発・控え選手に登録されていません。`,
      );
    }

    const assistNames = assistsText
      .split(/[、,]/)
      .map((name) => name.trim())
      .filter(Boolean);

    for (const assistName of assistNames) {
      if (
        registeredNames.size
        && !registeredNames.has(
          normalizePlayerName(assistName),
        )
      ) {
        errors.push(
          `得点欄${line.number}行目のアシスト`
          + `「${assistName}」が、`
          + `${teamName}の先発・控え選手に登録されていません。`,
        );
      }
    }
  }

  return errors;
}

function validateDisciplinaryPlayers(
  disciplinaryValue,
  startersValue,
  substitutesValue,
  teamLabel,
) {
  const errors = [];

  const registeredNames =
    collectRegisteredPlayerNames(
      startersValue,
      substitutesValue,
    );

  if (!registeredNames.size) {
    return errors;
  }

  for (
    const line
    of nonEmptyInputLines(disciplinaryValue)
  ) {
    const parsed =
      parseDisciplinaryLineForValidation(
        line.text,
      );

    if (!parsed.valid) {
      continue;
    }

    const playerName = parsed.playerName;

    if (
      playerName
      && !registeredNames.has(
        normalizePlayerName(playerName),
      )
    ) {
      errors.push(
        `${teamLabel}の警告・退場${line.number}行目の`
        + `選手「${playerName}」が`
        + "先発・控え選手に登録されていません。",
      );
    }
  }

  return errors;
}

function collectPlayerNamesFromInput(value) {
  return new Set(
    nonEmptyInputLines(value)
      .map((line) => {
        const parts = line.text
          .split("|")
          .map((part) => part.trim());

        return normalizePlayerName(parts[2] ?? "");
      })
      .filter(Boolean),
  );
}

function validateSubstitutionFlow(
  substitutionsValue,
  startersValue,
  substitutesValue,
  teamLabel,
) {
  const errors = [];

  const starters = collectPlayerNamesFromInput(
    startersValue,
  );

  const substitutes = collectPlayerNamesFromInput(
    substitutesValue,
  );

  if (!starters.size && !substitutes.size) {
    return errors;
  }

  const onPitch = new Set(starters);
  const alreadyOut = new Set();
  const alreadyIn = new Set();

  for (
    const line
    of nonEmptyInputLines(substitutionsValue)
  ) {
    const parts = line.text
      .split("|")
      .map((part) => part.trim());

    if (parts.length !== 3) {
      continue;
    }

    const playerOutRaw = parts[1];
    const playerInRaw = parts[2];

    const playerOut =
      normalizePlayerName(playerOutRaw);

    const playerIn =
      normalizePlayerName(playerInRaw);

    if (!playerOut || !playerIn) {
      continue;
    }

    if (alreadyOut.has(playerOut)) {
      errors.push(
        `${teamLabel}の交代${line.number}行目で、`
        + `「${playerOutRaw}」が2回目の交代OUTになっています。`,
      );
    }

    if (alreadyIn.has(playerIn)) {
      errors.push(
        `${teamLabel}の交代${line.number}行目で、`
        + `「${playerInRaw}」が2回目の交代INになっています。`,
      );
    }

    if (!onPitch.has(playerOut)) {
      errors.push(
        `${teamLabel}の交代${line.number}行目の`
        + `交代OUT選手「${playerOutRaw}」は、`
        + "その時点でピッチ上にいません。",
      );
    }

    if (!substitutes.has(playerIn)) {
      errors.push(
        `${teamLabel}の交代${line.number}行目の`
        + `交代IN選手「${playerInRaw}」は控え選手ではありません。`,
      );
    }

    if (onPitch.has(playerIn)) {
      errors.push(
        `${teamLabel}の交代${line.number}行目の`
        + `交代IN選手「${playerInRaw}」は、`
        + "すでにピッチ上にいます。",
      );
    }

    if (
      playerOut === playerIn
    ) {
      continue;
    }

    onPitch.delete(playerOut);
    onPitch.add(playerIn);

    alreadyOut.add(playerOut);
    alreadyIn.add(playerIn);
  }

  return errors;
}

function validateSubstitutionPlayers(
  substitutionsValue,
  startersValue,
  substitutesValue,
  teamLabel,
) {
  const errors = [];

  const registeredNames =
    collectRegisteredPlayerNames(
      startersValue,
      substitutesValue,
    );

  if (!registeredNames.size) {
    return errors;
  }

  for (
    const line
    of nonEmptyInputLines(substitutionsValue)
  ) {
    const parts = line.text
      .split("|")
      .map((part) => part.trim());

    if (parts.length !== 3) {
      continue;
    }

    const playerOut = parts[1];
    const playerIn = parts[2];

    if (
      playerOut
      && !registeredNames.has(
        normalizePlayerName(playerOut),
      )
    ) {
      errors.push(
        `${teamLabel}の交代${line.number}行目の`
        + `交代OUT選手「${playerOut}」が`
        + "先発・控え選手に登録されていません。",
      );
    }

    if (
      playerIn
      && !registeredNames.has(
        normalizePlayerName(playerIn),
      )
    ) {
      errors.push(
        `${teamLabel}の交代${line.number}行目の`
        + `交代IN選手「${playerIn}」が`
        + "先発・控え選手に登録されていません。",
      );
    }
  }

  return errors;
}

function validateSubstitutionInput(value, label) {
  const errors = [];

  for (const line of nonEmptyInputLines(value)) {
    const parts = line.text
      .split("|")
      .map((part) => part.trim());

    if (parts.length !== 3) {
      errors.push(
        `${label}${line.number}行目は「時間|交代OUT|交代IN」の3項目で入力してください。`,
      );
      continue;
    }

    const [
      minute,
      playerOut,
      playerIn,
    ] = parts;

    if (!isValidMinuteInput(minute, true)) {
      errors.push(
        `${label}${line.number}行目の時間「${minute}」が正しくありません。例：67、90+2、HT`,
      );
    }

    if (!playerOut) {
      errors.push(
        `${label}${line.number}行目の交代OUT選手が空欄です。`,
      );
    }

    if (!playerIn) {
      errors.push(
        `${label}${line.number}行目の交代IN選手が空欄です。`,
      );
    }

    if (
      playerOut
      && playerIn
      && playerOut === playerIn
    ) {
      errors.push(
        `${label}${line.number}行目の交代OUTと交代INが同じ選手です。`,
      );
    }
  }

  return errors;
}

function parseGoals(value, match) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [
        minuteText = "",
        teamName = "",
        scorerNumber = "",
        scorerName = "",
        assistsText = "",
      ] = line.split("|").map((part) => part.trim());

      const numericMinute = parseMinute(minuteText);

      return {
        minute: numericMinute,
        minuteLabel: minuteText,
        teamName:
          teamName
          || match.homeTeam?.name
          || "",
        scorerNumber,
        scorerName,
        assistNames: assistsText
          ? assistsText
              .split(/[、,]/)
              .map((name) => name.trim())
              .filter(Boolean)
          : [],
        buildUp: [],
        finish:
          scorerName === "オウンゴール"
            ? "O.G"
            : "S",
      };
    });
}

function parseMinute(value) {
  const normalized = String(value)
    .replaceAll("＋", "+")
    .replace(/\s/g, "");

  const added = normalized.match(
    /^(\d+)\+(\d+)$/,
  );

  if (added) {
    return Number(added[1]) + Number(added[2]);
  }

  const number = Number(normalized);

  return Number.isFinite(number)
    ? number
    : 0;
}

function formatDisciplinaryForInput(items) {
  return items.map((item) => {
    if (typeof item === "string") {
      return item;
    }

    return [
      item.minuteLabel ?? item.minute ?? "",
      item.type ?? "警告",
      item.playerName ?? "",
      item.reason ?? "",
    ].join("|");
  }).join("\n");
}

function parseDisciplinary(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (!line.includes("|")) {
        return line;
      }

      const [
        minute = "",
        type = "警告",
        playerName = "",
        reason = "",
      ] = line
        .split("|")
        .map((part) => part.trim());

      const reasonText = reason
        ? `（${reason}）`
        : "";

      return [
        minute ? `${minute} 分` : "",
        type,
        playerName,
        reasonText,
      ].filter(Boolean).join(" ");
    });
}

function formatPlayersForInput(players) {
  return players.map((player) => [
    player.position ?? "",
    player.number ?? "",
    player.name ?? "",
  ].join("|")).join("\n");
}

function parsePlayers(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [
        position = "",
        numberText = "",
        name = "",
      ] = line
        .split("|")
        .map((part) => part.trim());

      const number = Number(numberText);

      return {
        name,
        number:
          numberText !== "" && Number.isFinite(number)
            ? number
            : numberText,
        position: position.toUpperCase(),
      };
    })
    .filter((player) => player.name);
}

function formatSubstitutionsForInput(items) {
  return items.map((item) => {
    if (typeof item === "string") {
      const match = item.match(
        /^(.+?)\s*\[out\](.+?)\s*\[in\](.+)$/,
      );

      if (match) {
        return [
          match[1].replace(/\s*分\s*$/, "").trim(),
          match[2].trim(),
          match[3].trim(),
        ].join("|");
      }

      return item;
    }

    return [
      item.minuteLabel ?? item.minute ?? "",
      item.playerOut ?? "",
      item.playerIn ?? "",
    ].join("|");
  }).join("\n");
}

function parseSubstitutions(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [
        minute = "",
        playerOut = "",
        playerIn = "",
      ] = line.split("|").map((part) => part.trim());

      const minuteLabel =
        minute.toUpperCase() === "HT"
          ? "HT"
          : `${minute} 分`;

      return `${minuteLabel} [out]${playerOut} [in]${playerIn}`;
    });
}

function createOverrideDataPath(competition) {
  if (!competition) return null;
  if (competition.manualOverrides) return competition.manualOverrides;
  if (!competition.matches) return null;
  return competition.matches.replace(/matches\.json$/, "manual-match-overrides.json");
}

function createDestinationPath(competition) {
  const path = createOverrideDataPath(competition);
  return path ? `site/data/${path}` : "保存先未設定";
}

function createCompetitionLabel(competition) {
  if (competition.stage === "regular" && competition.division != null) {
    return `${competition.division}部`;
  }
  if (competition.stage === "promotion-playoff") return "プレーオフ";
  if (competition.stage === "division-2-playoff") return "2部プレーオフ";
  if (competition.stage === "promotion-relegation") return "入替戦";
  if (competition.stage === "i-league-regular") return `Iリーグ${competition.division}部`;
  return competition.stageName ?? competition.name;
}

function createOverrideDownloadName(competition) {
  let suffix = competition.stage;
  if (competition.stage === "regular") suffix = `division-${competition.division}`;
  if (competition.stage === "promotion-playoff") suffix = "playoff";
  if (competition.stage === "i-league-regular") suffix = `i-league-division-${competition.division}`;
  return `${competition.season}-${suffix}-manual-match-overrides.json`;
}

function createCompetitionDefinitionsFromMatches(matches) {
  const definitions = new Map();
  for (const match of matches) {
    if (!definitions.has(match.competitionId)) {
      definitions.set(match.competitionId, {
        id: match.competitionId,
        season: match.season,
        name: `${match.season}年度 ${match.leagueName} ${match.stageName}`,
        division: match.division,
        stage: match.stageId,
        stageName: match.stageName,
        matches: null,
      });
    }
  }
  return [...definitions.values()];
}
