'use client';

import { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, ColorType } from 'lightweight-charts';

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
}

export default function CandlestickChart({ 
  data, 
  height = 400,
  priceDecimalPlaces = 2
}: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // チャートの初期化（初回のみ）
  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    // チャートの作成
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'white' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#e0e0e0' },
        horzLines: { color: '#e0e0e0' },
      },
      width: chartContainerRef.current.clientWidth,
      height: height,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // ローソク足シリーズの追加（初期値）
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    seriesRef.current = candlestickSeries;

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
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [height]);

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

