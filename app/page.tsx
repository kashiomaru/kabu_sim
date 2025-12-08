'use client';

import { useState } from 'react';
import CandlestickChart from '@/components/CandlestickChart';

interface CandlestickData {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface AyumiData {
  date: string;
  time: string;
  price: number;
  volume: number;
  priceDecimalPlaces: number; // 価格の小数点桁数
}

export default function Home() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [indicator, setIndicator] = useState('準備中');
  const [seekValue, setSeekValue] = useState(0);
  const [csvText, setCsvText] = useState('');
  const [candlestickData, setCandlestickData] = useState<CandlestickData[] | undefined>(undefined);
  const [ayumiData, setAyumiData] = useState<AyumiData[] | null>(null); // 元の歩み値データを保持
  const [isControlsActive, setIsControlsActive] = useState(false);
  const [priceDecimalPlaces, setPriceDecimalPlaces] = useState<number>(2); // デフォルトは2桁
  const [timeRange, setTimeRange] = useState<{ min: number; max: number } | null>(null); // 時間範囲（Unixタイムスタンプ）

  const handlePlay = () => {
    setIsPlaying(!isPlaying);
    setIndicator(isPlaying ? '停止中' : '再生中');
  };

  const handleStepBack = () => {
    setIndicator('コマ戻し');
    // コマ戻しのロジックをここに追加
  };

  const handleStepForward = () => {
    setIndicator('コマ送り');
    // コマ送りのロジックをここに追加
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

    return data.length > 0 ? data : null;
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

  // 読み込みボタンのハンドラー
  const handleLoad = () => {
    if (!csvText.trim()) {
      alert('CSVデータを入力してください');
      return;
    }

    // CSVをパース
    const ayumiData = parseCsv(csvText);
    if (!ayumiData) {
      alert('CSV形式が正しくありません');
      setIsControlsActive(false);
      setCandlestickData(undefined);
      return;
    }

    // 1分足データを作成
    const { data: oneMinuteData, decimalPlaces, timeRange } = createOneMinuteData(ayumiData);
    if (!oneMinuteData) {
      alert('1分足データの作成に失敗しました');
      setIsControlsActive(false);
      setCandlestickData(undefined);
      setTimeRange(null);
      return;
    }

    // 成功したらデータを設定し、コントロールをアクティブにする
    setCandlestickData(oneMinuteData);
    setAyumiData(ayumiData); // 元の歩み値データも保持
    setPriceDecimalPlaces(decimalPlaces);
    setTimeRange(timeRange);
    setSeekValue(0); // シークバーを最初の位置にリセット
    setIsControlsActive(true);
    setIndicator('データ読み込み完了');
  };

  // シークバーの値から現在のデータポイントのインデックスを取得する関数
  const getCurrentDataIndex = (): number => {
    if (!candlestickData || candlestickData.length === 0) return 0;
    // シークバーの値（0-100）をデータポイントのインデックス（0〜データ数-1）にマッピング
    const maxIndex = candlestickData.length - 1;
    return Math.round((maxIndex * seekValue) / 100);
  };

  // シークバーの値から現在の時刻（Unixタイムスタンプ）を取得する関数
  const getCurrentTimestamp = (): number => {
    if (!candlestickData || candlestickData.length === 0) return 0;
    
    const dataIndex = getCurrentDataIndex();
    const currentData = candlestickData[dataIndex];
    const currentTime = typeof currentData.time === 'number' ? currentData.time : 0;
    
    // シークバーの値から秒の部分を計算（データポイント間を補間）
    if (candlestickData.length === 1) return currentTime;
    
    const maxIndex = candlestickData.length - 1;
    const exactIndex = (maxIndex * seekValue) / 100;
    const currentIndex = Math.floor(exactIndex);
    const nextIndex = Math.min(currentIndex + 1, maxIndex);
    
    if (currentIndex === nextIndex) return currentTime;
    
    const currentDataTime = typeof candlestickData[currentIndex].time === 'number' 
      ? candlestickData[currentIndex].time 
      : 0;
    const nextDataTime = typeof candlestickData[nextIndex].time === 'number' 
      ? candlestickData[nextIndex].time 
      : 0;
    
    // データポイント間を補間（秒の部分を計算）
    const fraction = exactIndex - currentIndex;
    const timeDiff = nextDataTime - currentDataTime;
    return currentDataTime + (timeDiff * fraction);
  };

  // シークバーの値から時間を計算する関数
  const getTimeFromSeekValue = (): string => {
    if (!candlestickData || candlestickData.length === 0) return '00:00:00';
    
    const currentTime = getCurrentTimestamp();
    
    // Unixタイムスタンプ（秒）をDateオブジェクトに変換
    const date = new Date(currentTime * 1000);
    
    // 00:00:00形式でフォーマット
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    
    return `${hours}:${minutes}:${seconds}`;
  };

  // 形成中の1分足を計算する関数
  const calculateFormingCandle = (currentTimestamp: number): CandlestickData | null => {
    if (!ayumiData || ayumiData.length === 0) return null;
    
    // 現在の時刻が属する分の開始時刻を計算
    const currentDate = new Date(currentTimestamp * 1000);
    const year = currentDate.getUTCFullYear();
    const month = currentDate.getUTCMonth();
    const day = currentDate.getUTCDate();
    const hour = currentDate.getUTCHours();
    const minute = currentDate.getUTCMinutes();
    
    // 分の開始時刻（秒を0に）
    const minuteStart = new Date(Date.UTC(year, month, day, hour, minute, 0));
    const minuteStartTimestamp = Math.floor(minuteStart.getTime() / 1000);
    
    // 現在の時刻までの歩み値データを抽出
    const formingAyumiData = ayumiData.filter((item) => {
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
      
      // UTCとしてDateオブジェクトを作成
      const itemDate = new Date(Date.UTC(itemYear, itemMonth, itemDay, itemHour, itemMinute, itemSecond));
      const itemTimestamp = Math.floor(itemDate.getTime() / 1000);
      
      // 現在の分の開始時刻から現在の時刻までのデータ
      return itemTimestamp >= minuteStartTimestamp && itemTimestamp <= currentTimestamp;
    });
    
    if (formingAyumiData.length === 0) return null;
    
    // 四本値を計算
    const prices = formingAyumiData.map(item => item.price);
    const open = prices[0];
    const close = prices[prices.length - 1];
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    
    return {
      time: minuteStartTimestamp,
      open,
      high,
      low,
      close,
    };
  };

  // シークバーの時刻に合わせて1分足データをフィルタリングする関数
  const getFilteredCandlestickData = (): CandlestickData[] | undefined => {
    if (!candlestickData || !timeRange) return undefined;
    
    const currentTimestamp = getCurrentTimestamp();
    
    // 現在の時刻までの1分足データをフィルタリング
    // 例：09:30:20の場合、09:30:00までのデータを表示（09:31:00は表示しない）
    // 秒を0にして分単位で比較するため、現在の時刻の分の開始時刻（秒を0にした時刻）までを表示
    const currentDate = new Date(currentTimestamp * 1000);
    currentDate.setUTCSeconds(0, 0); // 秒を0にして分の開始時刻に
    const currentMinuteStart = Math.floor(currentDate.getTime() / 1000);
    
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-4rem)]">
          {/* 左側：チャートエリア */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6">
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-white mb-4">
              価格チャート
            </h2>
            <div className="w-full h-[calc(100%-4rem)]">
              {candlestickData ? (
                <CandlestickChart height={600} data={getFilteredCandlestickData()} priceDecimalPlaces={priceDecimalPlaces} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                  <p>歩み値データを読み込んでください</p>
                </div>
              )}
            </div>
          </div>

          {/* 右側：上段（テキストエリア）と下段（ボタンエリア） */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            {/* 右上：テキストエリア */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 flex-1 flex flex-col min-h-0">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
                歩み値
              </h2>
              <textarea
                className="w-full flex-1 p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 overflow-y-auto mb-4"
                placeholder="歩み値（csv）をペースト"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
              <button 
                onClick={handleLoad}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200"
              >
                読み込み
              </button>
            </div>

            {/* 右下：ボタンエリア */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
                コントロール
              </h2>
              
              {/* ボタン群 */}
              <div className="flex gap-3 mb-4">
                <button
                  onClick={handleStepBack}
                  disabled={!isControlsActive}
                  className={`flex-1 font-semibold py-3 px-4 rounded-lg transition-colors duration-200 text-2xl ${
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
                  className={`flex-1 font-semibold py-3 px-4 rounded-lg transition-colors duration-200 text-2xl ${
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
                  className={`flex-1 font-semibold py-3 px-4 rounded-lg transition-colors duration-200 text-2xl ${
                    isControlsActive
                      ? 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50'
                  }`}
                >
                  ⏭
                </button>
              </div>

              {/* シークバー */}
              <div>
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
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

