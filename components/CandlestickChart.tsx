'use client';

import { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType, IPriceLine, CandlestickSeries } from 'lightweight-charts';

interface CandlestickData {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface CandlestickChartProps {
  data?: CandlestickData[];
  height?: number;
  priceDecimalPlaces?: number;
  upColor?: string; // 陽線の色
  downColor?: string; // 陰線の色
  backgroundColor?: string; // 背景色
  reloadKey?: number; // CSV再読み込み時にインクリメントされるキー
}

export default function CandlestickChart({ 
  data, 
  height = 400,
  priceDecimalPlaces = 2,
  upColor = '#26a69a', // デフォルト: 緑
  downColor = '#ef5350', // デフォルト: 赤
  backgroundColor = 'white', // デフォルト: 白
  reloadKey = 0 // デフォルト: 0
}: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);

  // チャートの初期化（初回のみ）
  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    // チャートの高さを決定（heightが指定されていない場合は親要素の高さを使用）
    const chartHeight = height || (chartContainerRef.current.parentElement?.clientHeight || 400);

    // チャートの作成
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: backgroundColor },
        textColor: backgroundColor === 'white' || backgroundColor === '#ffffff' ? '#333' : '#fff',
        attributionLogo: false, // TradingViewロゴを非表示
      },
      grid: {
        vertLines: { color: '#333333' },
        horzLines: { color: '#333333' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number, tickMarkType: any, locale: string) => {
          // Unixタイムスタンプ（秒）をDateオブジェクトに変換
          const date = new Date(time * 1000);
          // 時間のみを表示（HH:mm形式）
          const hours = String(date.getUTCHours()).padStart(2, '0');
          const minutes = String(date.getUTCMinutes()).padStart(2, '0');
          return `${hours}:${minutes}`;
        },
      },
      localization: {
        timeFormatter: (time: number) => {
          // Unixタイムスタンプ（秒）をDateオブジェクトに変換
          const date = new Date(time * 1000);
          // 時間のみを表示（HH:mm形式）
          const hours = String(date.getUTCHours()).padStart(2, '0');
          const minutes = String(date.getUTCMinutes()).padStart(2, '0');
          return `${hours}:${minutes}`;
        },
        priceFormatter: (price: number) => {
          // 小数点第1位まで表示し、小数点第1位が0の場合は小数点を表示しない
          const rounded = Math.round(price * 10) / 10; // 小数点第1位で丸める
          if (rounded % 1 === 0) {
            return rounded.toString(); // 整数の場合は小数点なし
          }
          return rounded.toFixed(1); // 小数点がある場合は小数点第1位まで
        },
      },
      crosshair: {
        mode: 0, // CrosshairMode.Normal - カーソル位置のY座標に対応する価格で横点線を表示
        vertLine: {
          visible: true,
        },
        horzLine: {
          visible: true, // カーソル位置の横点線は表示
          labelVisible: true, // 横点線の価格ラベルを表示
          labelBackgroundColor: '#333333', // 横点線ラベルの背景色（黒寄りのグレー）
        },
      },
    });

    chartRef.current = chart;

    // ローソク足シリーズの追加（初期値）
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: upColor,
      downColor: downColor,
      borderVisible: false,
      wickUpColor: upColor,
      wickDownColor: downColor,
      priceLineVisible: false, // 現在値位置の横点線を非表示
    });

    seriesRef.current = candlestickSeries;

    // クリックイベントハンドラー
    const handleClick = (param: any) => {
      if (!chartRef.current || !seriesRef.current || !param.point) return;

      // クリック位置のY座標から価格を取得
      const price = seriesRef.current.coordinateToPrice(param.point.y);
      if (price === null) return;

      // 既存の価格線があれば削除
      if (priceLineRef.current) {
        seriesRef.current.removePriceLine(priceLineRef.current);
        priceLineRef.current = null;
      }

      // 新しい赤い点線の価格線を追加
      const priceLine = seriesRef.current.createPriceLine({
        price: price,
        color: '#ff0000', // 赤色
        lineWidth: 1,
        lineStyle: 1, // LineStyle.Dotted (点線)
        axisLabelVisible: true, // ラベルを表示
        axisLabelColor: '#ffff00', // ラベルの背景色（黄色）
      });

      priceLineRef.current = priceLine;
    };

    chart.subscribeClick(handleClick);

    // リサイズハンドラー
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (priceLineRef.current && seriesRef.current) {
        seriesRef.current.removePriceLine(priceLineRef.current);
        priceLineRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [height, backgroundColor]);

  // 価格フォーマットの更新
  useEffect(() => {
    if (!seriesRef.current) return;

    // 価格フォーマットを設定
    const priceFormat = priceDecimalPlaces === 0
      ? { type: 'price' as const, precision: 0, minMove: 1 }
      : { type: 'price' as const, precision: priceDecimalPlaces, minMove: Math.pow(10, -priceDecimalPlaces) };

    seriesRef.current.applyOptions({
      priceFormat: priceFormat,
    });
  }, [priceDecimalPlaces]);

  // データの更新
  useEffect(() => {
    if (!seriesRef.current) return;

    // データが提供されている場合のみ表示（サンプルデータは表示しない）
    if (data) {
      seriesRef.current.setData(data as any);
    }
  }, [data]);

  // CSV再読み込み時に価格線を削除
  useEffect(() => {
    if (priceLineRef.current && seriesRef.current) {
      seriesRef.current.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }
  }, [reloadKey]);

  return (
    <div className="w-full">
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}

// サンプルデータを生成する関数
function generateSampleData(): CandlestickData[] {
  const data: CandlestickData[] = [];
  let basePrice = 100;
  const now = new Date();
  
  // 過去30日分のデータを生成
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const time = date.toISOString().split('T')[0];
    
    // ランダムな価格変動を生成
    const change = (Math.random() - 0.5) * 10;
    const open = basePrice;
    const close = basePrice + change;
    const high = Math.max(open, close) + Math.random() * 5;
    const low = Math.min(open, close) - Math.random() * 5;
    
    data.push({
      time,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
    });
    
    basePrice = close;
  }
  
  return data;
}

