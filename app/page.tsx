'use client';

import { useState } from 'react';
import CandlestickChart from '@/components/CandlestickChart';

export default function Home() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [indicator, setIndicator] = useState('準備中');
  const [seekValue, setSeekValue] = useState(0);

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
              <CandlestickChart height={600} />
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
              />
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200">
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
                  disabled
                  className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 font-semibold py-3 px-4 rounded-lg transition-colors duration-200 text-2xl cursor-not-allowed opacity-50"
                >
                  ⏮
                </button>
                <button
                  onClick={handlePlay}
                  disabled
                  className="flex-1 bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 text-2xl cursor-not-allowed opacity-50"
                >
                  ▶
                </button>
                <button
                  onClick={handleStepForward}
                  disabled
                  className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 font-semibold py-3 px-4 rounded-lg transition-colors duration-200 text-2xl cursor-not-allowed opacity-50"
                >
                  ⏭
                </button>
              </div>

              {/* シークバー */}
              <div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={seekValue}
                  onChange={(e) => setSeekValue(Number(e.target.value))}
                  disabled
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-not-allowed opacity-50"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

