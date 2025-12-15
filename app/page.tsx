'use client';

import { useState, useEffect, useRef } from 'react';
import CandlestickChart from '@/components/CandlestickChart';

interface CandlestickData {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  color?: string; // 個別のローソク足の色（ドージ用）
  borderColor?: string; // 個別のローソク足のボーダー色（ドージ用）
  wickColor?: string; // 個別のローソク足のヒゲの色（ドージ用）
}

interface AyumiData {
  date: string;
  time: string;
  price: number;
  volume: number;
  priceDecimalPlaces: number; // 価格の小数点桁数
  millisecond?: number; // 補助的なミリ秒情報（同じ秒内の順序に基づく）
}

interface LoadedFile {
  id: string; // 一意のID（タイムスタンプベース）
  fileName: string;
  csvText: string;
  ayumiData: AyumiData[];
  candlestickData: CandlestickData[];
  priceDecimalPlaces: number;
  timeRange: { min: number; max: number } | null;
  loadedAt: number; // 読み込み日時（タイムスタンプ）
}

export default function Home() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [indicator, setIndicator] = useState('準備中');
  const [seekValue, setSeekValue] = useState(0);
  const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([]); // 読み込んだファイル一覧
  const [activeFileId, setActiveFileId] = useState<string | null>(null); // 現在アクティブなファイルID
  const [candlestickData, setCandlestickData] = useState<CandlestickData[] | undefined>(undefined);
  const [ayumiData, setAyumiData] = useState<AyumiData[] | null>(null); // 元の歩み値データを保持
  const [isControlsActive, setIsControlsActive] = useState(false);
  const [priceDecimalPlaces, setPriceDecimalPlaces] = useState<number>(2); // デフォルトは2桁
  const [timeRange, setTimeRange] = useState<{ min: number; max: number } | null>(null); // 時間範囲（Unixタイムスタンプ）
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null); // 再生タイマーの参照
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1); // 速度倍率（x0.1, x1, x2, x3, x5, x10, x30, x60）
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false); // 速度倍率ドロップダウンの開閉状態
  const fileInputRef = useRef<HTMLInputElement | null>(null); // ファイル入力の参照
  const speedMenuRef = useRef<HTMLDivElement | null>(null); // 速度倍率メニューの参照
  const [reloadKey, setReloadKey] = useState(0); // CSV再読み込み用のキー
  const tableScrollRef = useRef<HTMLDivElement | null>(null); // テーブルスクロールコンテナの参照
  const [scrollTop, setScrollTop] = useState(0); // スクロール位置
  const [containerHeight, setContainerHeight] = useState(0); // コンテナの高さ

  // アクティブファイルのデータを取得
  const activeFile = loadedFiles.find(f => f.id === activeFileId) || null;
  const csvText = activeFile?.csvText || '';
  const fileName = activeFile?.fileName || null;

  // 仮想スクロール用の定数
  const ROW_HEIGHT = 32; // 1行の高さ（px）
  const OVERSCAN = 10; // 表示領域外にレンダリングする行数（上下に余裕を持たせる）

  // 仮想スクロール: 表示すべき行の範囲を計算
  const getVisibleRange = (containerHeight: number, dataLength: number) => {
    if (dataLength === 0) {
      return { start: 0, end: 0 };
    }

    // コンテナの高さが取得できない場合（初期レンダリング時など）、デフォルトの表示範囲を返す
    if (containerHeight === 0) {
      const defaultVisibleCount = 50; // デフォルトで50行表示
      return { start: 0, end: Math.min(dataLength, defaultVisibleCount + OVERSCAN) };
    }

    const visibleStart = Math.floor(scrollTop / ROW_HEIGHT);
    const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT);
    const start = Math.max(0, visibleStart - OVERSCAN);
    const end = Math.min(dataLength, visibleStart + visibleCount + OVERSCAN);

    return { start, end };
  };

  // スクロールイベントハンドラー
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  // コンテナのサイズを監視して更新
  useEffect(() => {
    const updateContainerHeight = () => {
      if (tableScrollRef.current) {
        setContainerHeight(tableScrollRef.current.clientHeight);
      }
    };

    // 初期サイズを取得
    updateContainerHeight();

    // ResizeObserverでサイズ変更を監視
    const resizeObserver = new ResizeObserver(() => {
      updateContainerHeight();
    });

    if (tableScrollRef.current) {
      resizeObserver.observe(tableScrollRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [activeFileId]); // ファイルが切り替わった時も再計算

  // ファイル選択のハンドラー
  const handleFileSelect = (fileId: string) => {
    const selectedFile = loadedFiles.find(f => f.id === fileId);
    if (!selectedFile) return;

    setActiveFileId(fileId);
    setCandlestickData(selectedFile.candlestickData);
    setAyumiData(selectedFile.ayumiData);
    setPriceDecimalPlaces(selectedFile.priceDecimalPlaces);
    setTimeRange(selectedFile.timeRange);
    setSeekValue(0); // シークバーを最初の位置にリセット
    setIsControlsActive(true);
    setIndicator('ファイルを切り替えました');
    setReloadKey((prev) => prev + 1); // 再読み込みキーをインクリメント
  };

  // 11:30〜12:30の範囲をスキップする関数（timestampはミリ秒単位）
  const skipLunchTime = (timestamp: number, direction: 'forward' | 'backward' = 'forward'): number => {
    const date = new Date(timestamp); // ミリ秒単位なのでそのまま使用
    const hour = date.getUTCHours();
    const minute = date.getUTCMinutes();
    const second = date.getUTCSeconds();
    
    // 11:30:00 から 12:30:00 の範囲をチェック
    const isInLunchTime = (hour === 11 && minute >= 30) || (hour === 12 && minute < 30);
    
    if (isInLunchTime) {
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth();
      const day = date.getUTCDate();
      
      if (direction === 'forward') {
        // 進む方向：12:30:00にジャンプ
        const skipToDate = new Date(Date.UTC(year, month, day, 12, 30, 0));
        return skipToDate.getTime(); // ミリ秒単位で返す
      } else {
        // 戻る方向：11:30:00の前（11:29:59）にジャンプ
        const skipToDate = new Date(Date.UTC(year, month, day, 11, 29, 59));
        return skipToDate.getTime(); // ミリ秒単位で返す
      }
    }
    
    return timestamp;
  };

  // 再生/停止の制御
  useEffect(() => {
    if (isPlaying && isControlsActive && candlestickData && candlestickData.length > 0) {
      // 再生中：100msごとにシークバーを更新（ミリ秒単位での進みを実現）
      playIntervalRef.current = setInterval(() => {
        setSeekValue((currentSeekValue) => {
          // 現在のシークバーの値から時刻を計算
          if (!candlestickData || candlestickData.length === 0) return currentSeekValue;
          
          const maxIndex = candlestickData.length - 1;
          const exactIndex = (maxIndex * currentSeekValue) / 100;
          const currentIndex = Math.floor(exactIndex);
          const nextIndex = Math.min(currentIndex + 1, maxIndex);
          
          const currentDataTime = (typeof candlestickData[currentIndex].time === 'number' 
            ? candlestickData[currentIndex].time 
            : 0) as number;
          const nextDataTime = (typeof candlestickData[nextIndex].time === 'number' 
            ? candlestickData[nextIndex].time 
            : 0) as number;
          
          // データポイント間を補間して現在の時刻を計算（秒単位）
          const fraction = exactIndex - currentIndex;
          const timeDiff = nextDataTime - currentDataTime;
          const currentTimestampSeconds = currentDataTime + (timeDiff * fraction);
          const currentTimestamp = currentTimestampSeconds * 1000; // ミリ秒単位に変換
          
          // データの最後の時刻を取得（秒単位をミリ秒単位に変換）
          const lastTimeValue = candlestickData[candlestickData.length - 1].time;
          const lastTime = ((typeof lastTimeValue === 'number' ? lastTimeValue : 0) as number) * 1000; // ミリ秒単位
          
          // 速度倍率を適用して進める（100ms × 倍率 × 10 = 1秒 × 倍率、ミリ秒単位）
          // 100msごとに更新するので、1秒進むには100ms × 10回 = 1000ms
          const stepMilliseconds = 100 * speedMultiplier;
          let newTimestamp = currentTimestamp + stepMilliseconds;
          
          // 11:30〜12:30の範囲をスキップ（進む方向）
          newTimestamp = skipLunchTime(newTimestamp, 'forward');
          
          // データの最後を超えた場合は停止
          if (newTimestamp > lastTime) {
            setIsPlaying(false);
            setIndicator('停止中');
            return 100; // 最後の位置に設定
          }
          
          // 新しい時刻に対応するシークバーの値を計算
          const firstTime = ((typeof candlestickData[0].time === 'number' ? candlestickData[0].time : 0) as number) * 1000; // ミリ秒単位
          if (newTimestamp <= firstTime) {
            return 0;
          }
          if (newTimestamp >= lastTime) {
            return 100;
          }
          
          // 時刻がどのデータポイントの範囲内にあるかを検索（ミリ秒単位で比較）
          for (let i = 0; i < candlestickData.length - 1; i++) {
            const currentTimeValue = candlestickData[i].time;
            const nextTimeValue = candlestickData[i + 1].time;
            const currentTime = ((typeof currentTimeValue === 'number' ? currentTimeValue : 0) as number) * 1000; // ミリ秒単位
            const nextTime = ((typeof nextTimeValue === 'number' ? nextTimeValue : 0) as number) * 1000; // ミリ秒単位
            
            if (newTimestamp >= currentTime && newTimestamp <= nextTime) {
              // データポイント間を補間
              const timeDiff2 = nextTime - currentTime;
              if (timeDiff2 === 0) {
                return (i * 100) / maxIndex;
              }
              const fraction2 = (newTimestamp - currentTime) / timeDiff2;
              const exactIndex2 = i + fraction2;
              return (exactIndex2 * 100) / maxIndex;
            }
          }
          
          return 100;
        });
      }, 100); // 100msごとに更新（ミリ秒単位での進みを実現）
    } else {
      // 停止中：タイマーをクリア
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    }
    
    // クリーンアップ
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    };
  }, [isPlaying, isControlsActive, candlestickData, speedMultiplier]);

  const handlePlay = () => {
    if (!isControlsActive || !candlestickData || candlestickData.length === 0) return;
    
    setIsPlaying(!isPlaying);
    setIndicator(isPlaying ? '停止中' : '再生中');
  };

  const handleStepBack = () => {
    if (!isControlsActive || !candlestickData || candlestickData.length === 0) return;
    
    const currentTimestamp = getCurrentTimestamp(); // ミリ秒単位
    // 速度倍率を適用して戻す（ミリ秒単位）
    const stepMilliseconds = 1000 * speedMultiplier;
    let newTimestamp = currentTimestamp - stepMilliseconds;
    
    // 11:30〜12:30の範囲をスキップ（戻る方向）
    newTimestamp = skipLunchTime(newTimestamp, 'backward');
    
    // 新しい時刻に対応するシークバーの値を計算
    const newSeekValue = getSeekValueFromTimestamp(newTimestamp);
    setSeekValue(Math.max(0, Math.min(100, newSeekValue)));
    setIndicator(`${speedMultiplier}秒戻し`);
  };

  const handleStepBack10 = () => {
    if (!isControlsActive || !candlestickData || candlestickData.length === 0) return;
    
    const currentTimestamp = getCurrentTimestamp(); // ミリ秒単位
    // 10倍の時間を戻す（速度倍率も適用、ミリ秒単位）
    const stepMilliseconds = 10000 * speedMultiplier;
    let newTimestamp = currentTimestamp - stepMilliseconds;
    
    // 11:30〜12:30の範囲をスキップ（戻る方向）
    newTimestamp = skipLunchTime(newTimestamp, 'backward');
    
    // 新しい時刻に対応するシークバーの値を計算
    const newSeekValue = getSeekValueFromTimestamp(newTimestamp);
    setSeekValue(Math.max(0, Math.min(100, newSeekValue)));
    setIndicator(`${10 * speedMultiplier}秒戻し`);
  };

  const handleStepForward = () => {
    if (!isControlsActive || !candlestickData || candlestickData.length === 0) return;
    
    const currentTimestamp = getCurrentTimestamp(); // ミリ秒単位
    // 速度倍率を適用して進める（ミリ秒単位）
    const stepMilliseconds = 1000 * speedMultiplier;
    let newTimestamp = currentTimestamp + stepMilliseconds;
    
    // 11:30〜12:30の範囲をスキップ（進む方向）
    newTimestamp = skipLunchTime(newTimestamp, 'forward');
    
    // 新しい時刻に対応するシークバーの値を計算
    const newSeekValue = getSeekValueFromTimestamp(newTimestamp);
    setSeekValue(Math.max(0, Math.min(100, newSeekValue)));
    setIndicator(`${speedMultiplier}秒送り`);
  };

  const handleStepForward10 = () => {
    if (!isControlsActive || !candlestickData || candlestickData.length === 0) return;
    
    const currentTimestamp = getCurrentTimestamp(); // ミリ秒単位
    // 10倍の時間を進める（速度倍率も適用、ミリ秒単位）
    const stepMilliseconds = 10000 * speedMultiplier;
    let newTimestamp = currentTimestamp + stepMilliseconds;
    
    // 11:30〜12:30の範囲をスキップ（進む方向）
    newTimestamp = skipLunchTime(newTimestamp, 'forward');
    
    // 新しい時刻に対応するシークバーの値を計算
    const newSeekValue = getSeekValueFromTimestamp(newTimestamp);
    setSeekValue(Math.max(0, Math.min(100, newSeekValue)));
    setIndicator(`${10 * speedMultiplier}秒送り`);
  };

  // 速度倍率を設定する関数
  const handleSpeedMultiplierSelect = (multiplier: number) => {
    setSpeedMultiplier(multiplier);
    setIsSpeedMenuOpen(false);
  };

  // メニュー外をクリックしたら閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(event.target as Node)) {
        setIsSpeedMenuOpen(false);
      }
    };

    if (isSpeedMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSpeedMenuOpen]);

  const handleResetSeconds = () => {
    if (!isControlsActive || !candlestickData || candlestickData.length === 0) return;
    
    const currentTimestamp = getCurrentTimestamp(); // ミリ秒単位
    
    // 現在の時刻から秒数を00にリセット
    const currentDate = new Date(currentTimestamp); // ミリ秒単位なのでそのまま使用
    currentDate.setUTCSeconds(0, 0); // 秒を00にリセット
    const newTimestamp = currentDate.getTime(); // ミリ秒単位で返す
    
    // 新しい時刻に対応するシークバーの値を計算
    const newSeekValue = getSeekValueFromTimestamp(newTimestamp);
    setSeekValue(Math.max(0, Math.min(100, newSeekValue)));
    setIndicator('秒数リセット');
  };

  const handleResetTenths = () => {
    if (!isControlsActive || !candlestickData || candlestickData.length === 0) return;
    
    const currentTimestamp = getCurrentTimestamp(); // ミリ秒単位
    
    // 現在の時刻からミリ秒部分を.0にリセット（ミリ秒を0に設定）
    const currentDate = new Date(currentTimestamp); // ミリ秒単位なのでそのまま使用
    const seconds = currentDate.getUTCSeconds();
    // ミリ秒部分を0にリセット（.0にリセット）
    currentDate.setUTCSeconds(seconds, 0);
    const newTimestamp = currentDate.getTime(); // ミリ秒単位で返す
    
    // 新しい時刻に対応するシークバーの値を計算
    const newSeekValue = getSeekValueFromTimestamp(newTimestamp);
    setSeekValue(Math.max(0, Math.min(100, newSeekValue)));
    setIndicator('ミリ秒リセット');
  };

  // CSVをパースする関数
  const parseCsv = (csvText: string): AyumiData[] | null => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return null;

    // ヘッダー行をチェック
    const header = lines[0].trim();
    if (!header.includes('日付') || !header.includes('時間') || !header.includes('約定値') || !header.includes('出来高')) {
      return null;
    }

    const data: AyumiData[] = [];
    
    // データ行をパース（ヘッダーを除く）
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // CSVのパース（カンマ区切り、ダブルクォート対応）
      const parts: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current.trim());

      if (parts.length < 4) continue;

      const date = parts[0].trim();
      const time = parts[1].trim();
      const priceStr = parts[2].trim();
      const price = parseFloat(priceStr);
      
      // 価格の小数点桁数を判定
      let priceDecimalPlaces = 0;
      if (priceStr.includes('.')) {
        const decimalPart = priceStr.split('.')[1];
        priceDecimalPlaces = decimalPart ? decimalPart.length : 0;
      }
      
      // 出来高からカンマを除去
      const volumeStr = parts[3].trim().replace(/"/g, '').replace(/,/g, '');
      const volume = parseFloat(volumeStr);

      if (isNaN(price) || isNaN(volume)) continue;

      data.push({ date, time, price, volume, priceDecimalPlaces });
    }

    if (data.length === 0) return null;

    // 同じ秒内の歩み値をグループ化してミリ秒を割り当て
    // 日付と時間（秒まで）をキーとしてグループ化
    const groupedBySecond = new Map<string, AyumiData[]>();
    
    for (const item of data) {
      // 日付と時間から秒までのキーを作成（例: "2025/12/05_15:30:45"）
      const timeParts = item.time.split(':');
      if (timeParts.length !== 3) continue;
      
      const secondKey = `${item.date}_${timeParts[0]}:${timeParts[1]}:${timeParts[2]}`;
      
      if (!groupedBySecond.has(secondKey)) {
        groupedBySecond.set(secondKey, []);
      }
      groupedBySecond.get(secondKey)!.push(item);
    }

    // 各グループに対してミリ秒を割り当て
    for (const [secondKey, items] of groupedBySecond) {
      const count = items.length;
      
      // 同じ秒内の歩み値を均等に割り当て
      // dataは時系列降順なので、itemsも降順（items[0]が最新、items[count-1]が最古）
      // 古いデータに小さいミリ秒を割り当てるため、indexを逆順にする
      // 例：2つの場合、古いデータに0ms、新しいデータに500ms
      // 例：3つの場合、古いデータに0ms、中間に333ms、新しいデータに666ms
      items.forEach((item, index) => {
        // 逆順のインデックスを使用（古いデータが先に適用されるように）
        const reverseIndex = count - 1 - index;
        item.millisecond = Math.floor((1000 / count) * reverseIndex);
      });
    }

    return data;
  };

  // 1分足データを作成する関数（時系列降順を考慮）
  const createOneMinuteData = (ayumiData: AyumiData[]): { data: CandlestickData[] | null; decimalPlaces: number; timeRange: { min: number; max: number } | null } => {
    if (ayumiData.length === 0) return { data: null, decimalPlaces: 0, timeRange: null };

    // 時系列降順なので、配列を逆順にして古い順にする
    const reversedData = [...ayumiData].reverse();

    // 最大の小数点桁数を追跡
    let maxDecimalPlaces = 0;

    // 1分ごとにグループ化
    const oneMinuteMap = new Map<string, {
      open: number;
      high: number;
      low: number;
      close: number;
      firstTime: string;
      dateTime: Date;
    }>();

    for (const item of reversedData) {
      // 日付と時間をパース（日本時間として扱う）
      // 形式: 2025/12/05, 15:30:00
      const dateParts = item.date.split('/');
      const timeParts = item.time.split(':');
      
      if (dateParts.length !== 3 || timeParts.length !== 3) continue;

      const year = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1; // 月は0ベース
      const day = parseInt(dateParts[2], 10);
      const hour = parseInt(timeParts[0], 10);
      const minute = parseInt(timeParts[1], 10);
      const second = parseInt(timeParts[2], 10);

      if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute) || isNaN(second)) continue;

      // 最大の小数点桁数を更新
      maxDecimalPlaces = Math.max(maxDecimalPlaces, item.priceDecimalPlaces);

      // CSVの時刻をそのままローカルタイムとして扱う
      // new Date(year, month, day, hour, minute, second)はローカルタイムゾーンとして解釈される
      // lightweight-chartsはUnixタイムスタンプを受け取り、表示時にローカルタイムゾーンで表示する
      const dateTime = new Date(year, month, day, hour, minute, second);
      
      if (isNaN(dateTime.getTime())) continue;

      // 1分単位のキーを作成（秒を0に）
      const minuteKey = new Date(year, month, day, hour, minute, 0);
      // キーとして使用するため、年月日時分を文字列で表現
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

      if (!oneMinuteMap.has(key)) {
        oneMinuteMap.set(key, {
          open: item.price,
          high: item.price,
          low: item.price,
          close: item.price,
          firstTime: key,
          dateTime: minuteKey, // Dateオブジェクトも保存
        });
      } else {
        const candle = oneMinuteMap.get(key)!;
        candle.high = Math.max(candle.high, item.price);
        candle.low = Math.min(candle.low, item.price);
        candle.close = item.price; // 最後の価格がclose
      }
    }

    // Mapから配列に変換し、時系列順にソート
    const result: CandlestickData[] = Array.from(oneMinuteMap.entries())
      .map(([key, candle]) => {
        // DateオブジェクトからUnixタイムスタンプ（秒）に変換
        // キーから年月日時分を取得して、UTCとしてタイムスタンプを作成
        // これにより、CSVの時刻がそのまま表示される
        const keyParts = key.split('T');
        const datePart = keyParts[0].split('-');
        const timePart = keyParts[1].split(':');
        const year = parseInt(datePart[0], 10);
        const month = parseInt(datePart[1], 10) - 1;
        const day = parseInt(datePart[2], 10);
        const hour = parseInt(timePart[0], 10);
        const minute = parseInt(timePart[1], 10);
        
        // UTCとしてDateオブジェクトを作成（CSVの時刻をそのままUTCとして扱う）
        const utcDate = new Date(Date.UTC(year, month, day, hour, minute, 0));
        const timestamp = Math.floor(utcDate.getTime() / 1000);
        
        return {
          time: timestamp, // lightweight-chartsはUnixタイムスタンプ（秒）をサポート
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        };
      })
      .sort((a, b) => {
        const timeA = typeof a.time === 'number' ? a.time : 0;
        const timeB = typeof b.time === 'number' ? b.time : 0;
        return timeA - timeB;
      });

    // ドージ（始値=終値）の場合、前のローソク足の色を継承
    // upColorとdownColorを取得（page.tsxで設定されている値を使用）
    const upColor = '#FF0000'; // 陽線の色（赤）
    const downColor = '#00FFFF'; // 陰線の色（シアン）
    
    for (let i = 0; i < result.length; i++) {
      const candle = result[i];
      // ドージ（始値=終値）を検出
      if (Math.abs(candle.open - candle.close) < 0.0001) { // 浮動小数点の誤差を考慮
        // 前のローソク足を探す
        let previousCandle: CandlestickData | null = null;
        for (let j = i - 1; j >= 0; j--) {
          // 前のローソク足がドージでない場合、それを使用
          if (Math.abs(result[j].open - result[j].close) >= 0.0001) {
            previousCandle = result[j];
            break;
          }
        }
        
        // 前のローソク足が見つかった場合、その色を継承
        if (previousCandle) {
          const isPreviousUp = previousCandle.close > previousCandle.open;
          candle.color = isPreviousUp ? upColor : downColor;
          candle.borderColor = isPreviousUp ? upColor : downColor;
          candle.wickColor = isPreviousUp ? upColor : downColor;
        } else {
          // 前のローソク足が見つからない場合（最初のローソク足がドージ）、デフォルトで陽線として扱う
          candle.color = upColor;
          candle.borderColor = upColor;
          candle.wickColor = upColor;
        }
      }
    }

    // 時間範囲を計算
    let timeRange: { min: number; max: number } | null = null;
    if (result.length > 0) {
      const firstTime = result[0].time;
      const lastTime = result[result.length - 1].time;
      const minTime: number = typeof firstTime === 'number' ? firstTime : 0;
      const maxTime: number = typeof lastTime === 'number' ? lastTime : 0;
      timeRange = {
        min: minTime,
        max: maxTime,
      };
    }

    return { data: result.length > 0 ? result : null, decimalPlaces: maxDecimalPlaces, timeRange };
  };

  // ファイルアップロードのハンドラー
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        // ファイル内容を直接処理して読み込む
        // 状態更新が非同期のため、直接ファイル内容を処理
        setTimeout(() => {
          // CSVをパース
          const ayumiData = parseCsv(text);
          if (!ayumiData) {
            alert('CSV形式が正しくありません');
            return;
          }

          // 1分足データを作成
          const { data: oneMinuteData, decimalPlaces, timeRange } = createOneMinuteData(ayumiData);
          if (!oneMinuteData) {
            alert('1分足データの作成に失敗しました');
            return;
          }

          // 新しいファイル情報を作成
          const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const newFile: LoadedFile = {
            id: fileId,
            fileName: file.name,
            csvText: text,
            ayumiData: ayumiData,
            candlestickData: oneMinuteData,
            priceDecimalPlaces: decimalPlaces,
            timeRange: timeRange,
            loadedAt: Date.now(),
          };

          // ファイルリストに追加
          setLoadedFiles((prev) => [...prev, newFile]);
          
          // 新しく読み込んだファイルをアクティブにする
          setActiveFileId(fileId);
          setCandlestickData(oneMinuteData);
          setAyumiData(ayumiData);
          setPriceDecimalPlaces(decimalPlaces);
          setTimeRange(timeRange);
          setSeekValue(0); // シークバーを最初の位置にリセット
          setIsControlsActive(true);
          setIndicator('データ読み込み完了');
          setReloadKey((prev) => prev + 1); // 再読み込みキーをインクリメント
        }, 0);
      }
    };
    reader.onerror = () => {
      alert('ファイルの読み込みに失敗しました');
    };
    reader.readAsText(file, 'UTF-8');
    
    // 同じファイルを再度選択できるようにリセット
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ファイル選択ダイアログを開く
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };


  // シークバーの値から現在のデータポイントのインデックスを取得する関数
  const getCurrentDataIndex = (): number => {
    if (!candlestickData || candlestickData.length === 0) return 0;
    // シークバーの値（0-100）をデータポイントのインデックス（0〜データ数-1）にマッピング
    const maxIndex = candlestickData.length - 1;
    return Math.round((maxIndex * seekValue) / 100);
  };

  // シークバーの値から現在の時刻（Unixタイムスタンプ、ミリ秒単位）を取得する関数
  const getCurrentTimestamp = (): number => {
    if (!candlestickData || candlestickData.length === 0) return 0;
    
    const dataIndex = getCurrentDataIndex();
    const currentData = candlestickData[dataIndex];
    const currentTime = typeof currentData.time === 'number' ? currentData.time : 0;
    
    // シークバーの値から秒の部分を計算（データポイント間を補間）
    if (candlestickData.length === 1) return currentTime * 1000; // ミリ秒単位に変換
    
    const maxIndex = candlestickData.length - 1;
    const exactIndex = (maxIndex * seekValue) / 100;
    const currentIndex = Math.floor(exactIndex);
    const nextIndex = Math.min(currentIndex + 1, maxIndex);
    
    if (currentIndex === nextIndex) return currentTime * 1000; // ミリ秒単位に変換
    
    const currentDataTime = typeof candlestickData[currentIndex].time === 'number' 
      ? candlestickData[currentIndex].time 
      : 0;
    const nextDataTime = typeof candlestickData[nextIndex].time === 'number' 
      ? candlestickData[nextIndex].time 
      : 0;
    
    // データポイント間を補間（秒単位で計算後、ミリ秒単位に変換）
    const fraction = exactIndex - currentIndex;
    const timeDiff = nextDataTime - currentDataTime;
    const timestampSeconds = currentDataTime + (timeDiff * fraction);
    return timestampSeconds * 1000; // ミリ秒単位に変換
  };

  // シークバーの値から時間を計算する関数
  const getTimeFromSeekValue = (): string => {
    if (!candlestickData || candlestickData.length === 0) return '00:00:00.0';
    
    const currentTime = getCurrentTimestamp(); // ミリ秒単位
    
    // Unixタイムスタンプ（ミリ秒）をDateオブジェクトに変換
    const date = new Date(currentTime);
    
    // 00:00:00.0形式でフォーマット（小数点第1位まで固定表示）
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    const milliseconds = date.getUTCMilliseconds();
    
    // ミリ秒を小数点第1位（0-9）に変換して固定表示
    const tenths = Math.floor(milliseconds / 100);
    return `${hours}:${minutes}:${seconds}.${tenths}`;
  };

  // 時刻からシークバーの値を計算する関数（timestampはミリ秒単位）
  const getSeekValueFromTimestamp = (timestamp: number): number => {
    if (!candlestickData || candlestickData.length === 0) return 0;
    
    // ミリ秒単位のタイムスタンプを秒単位に変換して比較
    const timestampSeconds = timestamp / 1000;
    
    // 時刻がデータ範囲外の場合は、範囲内に制限
    const firstTimeValue = candlestickData[0].time;
    const lastTimeValue = candlestickData[candlestickData.length - 1].time;
    const firstTime = (typeof firstTimeValue === 'number' ? firstTimeValue : 0) as number;
    const lastTime = (typeof lastTimeValue === 'number' ? lastTimeValue : 0) as number;
    
    if (timestampSeconds <= firstTime) return 0;
    if (timestampSeconds >= lastTime) return 100;
    
    // 時刻がどのデータポイントの範囲内にあるかを検索
    for (let i = 0; i < candlestickData.length - 1; i++) {
      const currentTimeValue = candlestickData[i].time;
      const nextTimeValue = candlestickData[i + 1].time;
      const currentTime = (typeof currentTimeValue === 'number' ? currentTimeValue : 0) as number;
      const nextTime = (typeof nextTimeValue === 'number' ? nextTimeValue : 0) as number;
      
      if (timestampSeconds >= currentTime && timestampSeconds <= nextTime) {
        // データポイント間を補間
        const timeDiff = nextTime - currentTime;
        if (timeDiff === 0) {
          return (i * 100) / (candlestickData.length - 1);
        }
        const fraction = (timestampSeconds - currentTime) / timeDiff;
        const exactIndex = i + fraction;
        return (exactIndex * 100) / (candlestickData.length - 1);
      }
    }
    
    return 100;
  };

  // 形成中の1分足を計算する関数（currentTimestampはミリ秒単位）
  const calculateFormingCandle = (currentTimestamp: number): CandlestickData | null => {
    if (!ayumiData || ayumiData.length === 0) return null;
    
    // 現在の時刻が属する分の開始時刻を計算
    const currentDate = new Date(currentTimestamp); // ミリ秒単位なのでそのまま使用
    const year = currentDate.getUTCFullYear();
    const month = currentDate.getUTCMonth();
    const day = currentDate.getUTCDate();
    const hour = currentDate.getUTCHours();
    const minute = currentDate.getUTCMinutes();
    const second = currentDate.getUTCSeconds();
    
    // 現在の時刻が分の開始時刻（秒が0）の場合は、形成中の1分足はない
    // 例：10:12:00の時点では、10:12:00の1分足は未形成
    if (second === 0) return null;
    
    // 現在の分の開始時刻を計算（形成中の1分足は現在の分）
    // 例：10:12:01の時点では、10:12:00の1分足が形成中
    const currentMinuteStart = new Date(Date.UTC(year, month, day, hour, minute, 0));
    const currentMinuteStartTimestamp = Math.floor(currentMinuteStart.getTime() / 1000); // 秒単位（データ形式に合わせる）
    
    // 現在の分の開始時刻から現在の時刻までの歩み値データを抽出（インデックスも保持）
    // ミリ秒情報を使用してより正確に判定
    const formingAyumiDataWithIndex = ayumiData
      .map((item, index) => ({ item, originalIndex: index }))
      .filter(({ item }) => {
        // 日付と時間をパース
        const dateParts = item.date.split('/');
        const timeParts = item.time.split(':');
        
        if (dateParts.length !== 3 || timeParts.length !== 3) return false;
        
        const itemYear = parseInt(dateParts[0], 10);
        const itemMonth = parseInt(dateParts[1], 10) - 1;
        const itemDay = parseInt(dateParts[2], 10);
        const itemHour = parseInt(timeParts[0], 10);
        const itemMinute = parseInt(timeParts[1], 10);
        const itemSecond = parseInt(timeParts[2], 10);
        
        // createOneMinuteDataと同じロジック：最終的にはUTCとしてタイムスタンプを作成
        // createOneMinuteDataでは、new Date(year, month, day, hour, minute, second)でローカルタイムゾーンとして解釈しているが、
        // 最終的にはUTCとしてタイムスタンプを作成している（467行目）
        // ここでも同じロジックを使う：UTCとしてタイムスタンプを作成
        const itemDateUTC = new Date(Date.UTC(itemYear, itemMonth, itemDay, itemHour, itemMinute, itemSecond));
        const itemTimestampSeconds = Math.floor(itemDateUTC.getTime() / 1000); // 秒単位
        
        // ミリ秒情報を取得（なければ0）
        const itemMillisecond = item.millisecond ?? 0;
        
        // ミリ秒を含めたタイムスタンプ（ミリ秒単位）
        const itemTimestampMs = itemTimestampSeconds * 1000 + itemMillisecond;
        
        // 現在のタイムスタンプから秒とミリ秒を取得
        const currentSecond = Math.floor(currentTimestamp / 1000);
        const currentMsInSecond = currentTimestamp % 1000;
        const itemSecondValue = itemTimestampSeconds;
        
        // 歩み値が現在の分に属するかどうかを確認（分単位で比較）
        // createOneMinuteDataと同じロジック：UTCとしてタイムスタンプを作成
        const itemMinuteStart = new Date(Date.UTC(itemYear, itemMonth, itemDay, itemHour, itemMinute, 0));
        const itemMinuteStartTimestamp = Math.floor(itemMinuteStart.getTime() / 1000);
        
        // 現在の分の開始時刻と一致しない場合は除外（現在の分のデータのみを含める）
        if (itemMinuteStartTimestamp !== currentMinuteStartTimestamp) {
          return false;
        }
        
        // 同じ秒内の場合、ミリ秒で比較
        if (currentSecond === itemSecondValue) {
          // 歩み値のミリ秒が現在のミリ秒以下であれば反映される
          return itemMillisecond <= currentMsInSecond;
        }
        
        // 異なる秒の場合、現在のタイムスタンプ以下であれば反映される
        return itemTimestampMs <= currentTimestamp;
      });
    
    if (formingAyumiDataWithIndex.length === 0) return null;
    
    // 時系列順（古い順）にソート、ミリ秒情報も考慮
    // ayumiDataは時系列降順なので、同じ秒数の場合はoriginalIndexが小さい方が新しいデータ
    // createOneMinuteDataと同じロジックでソートする
    const sortedAyumiData = [...formingAyumiDataWithIndex].sort((a, b) => {
      const datePartsA = a.item.date.split('/');
      const timePartsA = a.item.time.split(':');
      const datePartsB = b.item.date.split('/');
      const timePartsB = b.item.time.split(':');
      
      if (datePartsA.length !== 3 || timePartsA.length !== 3) return 0;
      if (datePartsB.length !== 3 || timePartsB.length !== 3) return 0;
      
      const yearA = parseInt(datePartsA[0], 10);
      const monthA = parseInt(datePartsA[1], 10) - 1;
      const dayA = parseInt(datePartsA[2], 10);
      const hourA = parseInt(timePartsA[0], 10);
      const minuteA = parseInt(timePartsA[1], 10);
      const secondA = parseInt(timePartsA[2], 10);
      
      const yearB = parseInt(datePartsB[0], 10);
      const monthB = parseInt(datePartsB[1], 10) - 1;
      const dayB = parseInt(datePartsB[2], 10);
      const hourB = parseInt(timePartsB[0], 10);
      const minuteB = parseInt(timePartsB[1], 10);
      const secondB = parseInt(timePartsB[2], 10);
      
      // タイムスタンプを計算（ミリ秒を含む）
      const dateA = new Date(Date.UTC(yearA, monthA, dayA, hourA, minuteA, secondA));
      const dateB = new Date(Date.UTC(yearB, monthB, dayB, hourB, minuteB, secondB));
      const timestampA = dateA.getTime() + (a.item.millisecond ?? 0);
      const timestampB = dateB.getTime() + (b.item.millisecond ?? 0);
      
      const timeDiff = timestampA - timestampB;
      
      // タイムスタンプが同じ場合、元の順序を保持（originalIndexが小さい方が新しいデータなので、降順に並べる）
      if (timeDiff === 0) {
        // ayumiDataは時系列降順なので、originalIndexが小さい方が新しい
        // 時系列順（古い順）にソートするため、originalIndexが大きい方が古い
        return b.originalIndex - a.originalIndex;
      }
      
      return timeDiff;
    });
    
    // 四本値を計算（時系列順にソート済み）
    // createOneMinuteDataと同じロジック：最初の歩み値がopen、最後の歩み値がclose
    const prices = sortedAyumiData.map(({ item }) => item.price);
    if (prices.length === 0) return null;
    
    const open = prices[0]; // 分の開始時刻の価格（最初）
    const close = prices[prices.length - 1]; // 現在の時刻の価格（最後）
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    
    const candle: CandlestickData = {
      time: currentMinuteStartTimestamp, // 現在の分の開始時刻
      open,
      high,
      low,
      close,
    };
    
    // ドージ（始値=終値）の場合、前のローソク足の色を継承
    if (Math.abs(candle.open - candle.close) < 0.0001) { // 浮動小数点の誤差を考慮
      // 前のローソク足を探す（完成した1分足データから）
      if (candlestickData && candlestickData.length > 0) {
        // 現在の分より前の最後のローソク足を探す
        let previousCandle: CandlestickData | null = null;
        for (let i = candlestickData.length - 1; i >= 0; i--) {
          const prevTimeValue = candlestickData[i].time;
          const prevTime: number = typeof prevTimeValue === 'number' ? prevTimeValue : 0;
          if (prevTime < currentMinuteStartTimestamp) {
            // 前のローソク足がドージでない場合、それを使用
            if (Math.abs(candlestickData[i].open - candlestickData[i].close) >= 0.0001) {
              previousCandle = candlestickData[i];
              break;
            }
          }
        }
        
        // 前のローソク足が見つかった場合、その色を継承
        if (previousCandle) {
          const upColor = '#FF0000'; // 陽線の色（赤）
          const downColor = '#00FFFF'; // 陰線の色（シアン）
          const isPreviousUp = previousCandle.close > previousCandle.open;
          candle.color = isPreviousUp ? upColor : downColor;
          candle.borderColor = isPreviousUp ? upColor : downColor;
          candle.wickColor = isPreviousUp ? upColor : downColor;
        } else {
          // 前のローソク足が見つからない場合、デフォルトで陽線として扱う
          candle.color = '#FF0000';
          candle.borderColor = '#FF0000';
          candle.wickColor = '#FF0000';
        }
      } else {
        // 完成した1分足データがない場合、デフォルトで陽線として扱う
        candle.color = '#FF0000';
        candle.borderColor = '#FF0000';
        candle.wickColor = '#FF0000';
      }
    }
    
    return candle;
  };

  // シークバーの時刻に合わせて1分足データをフィルタリングする関数
  const getFilteredCandlestickData = (): CandlestickData[] | undefined => {
    if (!candlestickData || !timeRange) return undefined;
    
    const currentTimestamp = getCurrentTimestamp(); // ミリ秒単位
    
    // 現在の時刻までの1分足データをフィルタリング
    // 例：09:30:20の場合、09:30:00までのデータを表示（09:31:00は表示しない）
    // 秒を0にして分単位で比較するため、現在の時刻の分の開始時刻（秒を0にした時刻）までを表示
    const currentDate = new Date(currentTimestamp); // ミリ秒単位なのでそのまま使用
    currentDate.setUTCSeconds(0, 0); // 秒を0にして分の開始時刻に
    const currentMinuteStart = Math.floor(currentDate.getTime() / 1000); // 秒単位（データ形式に合わせる）
    
    // 完成した1分足データをフィルタリング
    const completedCandles = candlestickData.filter((candle) => {
      const candleTime = typeof candle.time === 'number' ? candle.time : 0;
      // 現在の分の開始時刻より前のデータのみを表示
      return candleTime < currentMinuteStart;
    });
    
    // 形成中の1分足を計算
    const formingCandle = calculateFormingCandle(currentTimestamp);
    
    // 形成中の1分足がある場合は追加
    if (formingCandle) {
      return [...completedCandles, formingCandle];
    }
    
    return completedCandles;
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
            チャートシミュレーター（１分足）
          </h1>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">
          {/* 左側：チャートエリア */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 flex flex-col">
            {/* チャート部分 */}
            <div className="w-full flex-1 min-h-0 mb-4">
              {candlestickData ? (
                <CandlestickChart 
                  height={600} 
                  data={getFilteredCandlestickData()} 
                  priceDecimalPlaces={priceDecimalPlaces}
                  upColor="#FF0000"
                  downColor="#00FFFF"
                  backgroundColor="#000000"
                  reloadKey={reloadKey}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                  <p>歩み値データを読み込んでください</p>
                </div>
              )}
            </div>

            {/* コントローラー部分 */}
            <div className="w-full mt-4">
              {/* シークバー */}
              <div className="mb-4">
                {/* 時間表示 */}
                <div className="mb-2 text-center">
                  <span className="text-lg font-mono font-semibold text-gray-800 dark:text-white">
                    {getTimeFromSeekValue()}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={seekValue}
                  onChange={(e) => setSeekValue(Number(e.target.value))}
                  disabled={!isControlsActive}
                  className={`w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none accent-blue-600 ${
                    isControlsActive ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                  }`}
                />
              </div>

              {/* ボタン群 */}
              <div className="flex gap-2">
                <button
                  onClick={handleStepBack10}
                  disabled={!isControlsActive}
                  className={`flex-1 font-semibold py-2 px-2 rounded-lg transition-colors duration-200 text-lg min-w-0 h-10 flex items-center justify-center ${
                    isControlsActive
                      ? 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50'
                  }`}
                >
                  ⏮ "
                </button>
                <button
                  onClick={handleStepBack}
                  disabled={!isControlsActive}
                  className={`flex-1 font-semibold py-2 px-2 rounded-lg transition-colors duration-200 text-lg min-w-0 h-10 flex items-center justify-center ${
                    isControlsActive
                      ? 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50'
                  }`}
                >
                  ⏮
                </button>
                <button
                  onClick={handlePlay}
                  disabled={!isControlsActive}
                  className={`flex-1 font-semibold py-2 px-2 rounded-lg transition-colors duration-200 text-lg min-w-0 h-10 flex items-center justify-center ${
                    isControlsActive
                      ? isPlaying
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-blue-600 text-white cursor-not-allowed opacity-50'
                  }`}
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <button
                  onClick={handleStepForward}
                  disabled={!isControlsActive}
                  className={`flex-1 font-semibold py-2 px-2 rounded-lg transition-colors duration-200 text-lg min-w-0 h-10 flex items-center justify-center ${
                    isControlsActive
                      ? 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50'
                  }`}
                >
                  ⏭
                </button>
                <button
                  onClick={handleStepForward10}
                  disabled={!isControlsActive}
                  className={`flex-1 font-semibold py-2 px-2 rounded-lg transition-colors duration-200 text-lg min-w-0 h-10 flex items-center justify-center ${
                    isControlsActive
                      ? 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50'
                  }`}
                >
                  ⏭ "
                </button>
                <div className="relative" ref={speedMenuRef}>
                  <button
                    onClick={() => isControlsActive && setIsSpeedMenuOpen(!isSpeedMenuOpen)}
                    disabled={!isControlsActive}
                    className={`font-semibold py-2 px-3 rounded-lg transition-colors duration-200 text-sm w-12 h-10 flex items-center justify-center ${
                      isControlsActive
                        ? 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50'
                    }`}
                  >
                    x{speedMultiplier}
                  </button>
                  {isSpeedMenuOpen && isControlsActive && (
                    <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-10 w-12">
                      {[0.1, 1, 2, 3, 5, 10, 30, 60].map((multiplier) => (
                        <button
                          key={multiplier}
                          onClick={() => handleSpeedMultiplierSelect(multiplier)}
                          className={`w-full text-center px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                            speedMultiplier === multiplier
                              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-semibold'
                              : 'text-gray-800 dark:text-gray-200'
                          }`}
                        >
                          x{multiplier}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleResetSeconds}
                  disabled={!isControlsActive}
                  className={`font-semibold py-2 px-3 rounded-lg transition-colors duration-200 text-sm w-12 h-10 flex items-center justify-center ${
                    isControlsActive
                      ? 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50'
                  }`}
                >
                  00
                </button>
                <button
                  onClick={handleResetTenths}
                  disabled={!isControlsActive}
                  className={`font-semibold py-2 px-3 rounded-lg transition-colors duration-200 text-sm w-12 h-10 flex items-center justify-center ${
                    isControlsActive
                      ? 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50'
                  }`}
                >
                  .0
                </button>
              </div>
            </div>
          </div>

          {/* 右側：テキストエリア */}
          <div className="lg:col-span-1 flex flex-col min-h-0 h-full">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 h-full flex flex-col overflow-hidden">
              {/* ファイル選択UI */}
              <div className="mb-4 flex-shrink-0">
                <select
                  value={activeFileId || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleFileSelect(e.target.value);
                    }
                  }}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {loadedFiles.length === 0 ? (
                    <option value="">ファイルが読み込まれていません</option>
                  ) : (
                    loadedFiles.map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.fileName}
                      </option>
                    ))
                  )}
                </select>
              </div>
              {/* テーブル表示 */}
              {activeFile && activeFile.ayumiData.length > 0 ? (
                <div className="flex-1 min-h-0 mb-4 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden flex flex-col">
                  <div 
                    ref={tableScrollRef}
                    className="h-full overflow-y-auto overscroll-contain"
                    onScroll={handleScroll}
                  >
                    <table className="w-full text-sm table-fixed">
                      <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-300 dark:border-gray-600 w-1/4">日付</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-300 dark:border-gray-600 w-1/4">時間</th>
                          <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-300 dark:border-gray-600 w-1/4">約定値</th>
                          <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-300 dark:border-gray-600 w-1/4">出来高</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800">
                        {(() => {
                          const currentHeight = containerHeight || tableScrollRef.current?.clientHeight || 0;
                          const { start, end } = getVisibleRange(currentHeight, activeFile.ayumiData.length);
                          const visibleData = activeFile.ayumiData.slice(start, end);
                          const totalHeight = activeFile.ayumiData.length * ROW_HEIGHT;
                          const offsetY = start * ROW_HEIGHT;

                          return (
                            <>
                              {/* 上部のプレースホルダー */}
                              {start > 0 && (
                                <tr>
                                  <td colSpan={4} style={{ height: offsetY, padding: 0 }} />
                                </tr>
                              )}
                              {/* 表示すべき行 */}
                              {visibleData.map((row, index) => (
                                <tr 
                                  key={start + index} 
                                  className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                                  style={{ height: ROW_HEIGHT }}
                                >
                                  <td className="px-3 py-1 text-gray-900 dark:text-gray-100 truncate">{row.date}</td>
                                  <td className="px-3 py-1 text-gray-900 dark:text-gray-100">{row.time}</td>
                                  <td className="px-3 py-1 text-right text-gray-900 dark:text-gray-100 font-mono">
                                    {row.price.toFixed(row.priceDecimalPlaces)}
                                  </td>
                                  <td className="px-3 py-1 text-right text-gray-900 dark:text-gray-100 font-mono">
                                    {row.volume.toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                              {/* 下部のプレースホルダー */}
                              {end < activeFile.ayumiData.length && (
                                <tr>
                                  <td colSpan={4} style={{ height: totalHeight - (end * ROW_HEIGHT), padding: 0 }} />
                                </tr>
                              )}
                            </>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex items-center justify-center text-gray-500 dark:text-gray-400 mb-4 border border-gray-300 dark:border-gray-600 rounded-lg">
                  <p className="text-center px-4">ファイルを選択すると、読み込んだファイルの内容が表示されます</p>
                </div>
              )}
              <div className="flex-shrink-0">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".csv"
                  className="hidden"
                />
                <button 
                  onClick={handleUploadClick}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200"
                >
                  ファイル選択
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* フッター */}
        <footer className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-3">
            使用方法
          </h3>
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
            <p>1. 歩み値データの読み込み方法：</p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li>「ファイル選択」ボタンをクリックしてCSVファイルを選択（自動で読み込まれます）</li>
              <li>読み込んだファイルの内容は右上のテキストエリアに表示されます</li>
            </ul>
            <p>2. コントロールボタンで時間を操作できます：</p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li>⏮ / ⏭ : 1秒または1分戻し/送り（速度モードで切り替え）</li>
              <li>▶ / ⏸ : 再生/停止（速度モードに応じて1秒または1分ずつ進む）</li>
              <li>sec/min : 速度モード切り替え（sec: 1秒単位、min: 1分単位）</li>
            </ul>
            <p>3. シークバーを動かすと、その時刻までの1分足が表示されます</p>
            <p>4. チャートにカーソルを置くと、カーソル位置の価格が表示されます</p>
            <p>5. チャートの縦軸と横軸はドラッグでスケールを変更できます</p>
            <p>6. チャートもドラッグで移動スライドできます</p>
          </div>
          
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-3 mt-6">
            歩み値の仕様
          </h3>
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li>CSV形式で、ヘッダー行に「日付,時間 ,約定値,出来高」が含まれること</li>
              <li>データ行は「日付,時間,約定値,出来高」の形式（例：2025/12/05,15:30:00,258,"230,400"）</li>
              <li>時系列は降順（新しいデータが上、古いデータが下）</li>
              <li>出来高はカンマ区切りの数値文字列でも可（例："230,400"）</li>
              <li>歩み値データは1日分のみ保証しています（複数日にまたがるデータは動作を保証しません）</li>
            </ul>
          </div>
          
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-3 mt-6">
            注意事項
          </h3>
          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li>個人用で作ったものなので不具合等あります</li>
              <li>入力データは HYPER SBI 2 から出力できる歩み値を保証しています</li>
              <li>要望・不具合等があればこちらまでお願いします
                <a 
                  href="https://x.com/kashio6856" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline ml-1"
                >
                  かしお@てっく@kashio6856
                </a>
              </li>
            </ul>
          </div>
        </footer>
      </div>
    </main>
  );
}

