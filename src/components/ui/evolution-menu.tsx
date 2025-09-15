import React, { useState } from 'react';

interface EvolutionMenuProps {
  currentStreak: number;
  isOpen: boolean;
  onClose: () => void;
}

export function EvolutionMenu({ currentStreak, isOpen, onClose }: EvolutionMenuProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gradient-to-br from-white/10 to-white/20 rounded-3xl p-6 max-w-md w-11/12 shadow-2xl relative border-2 border-white/30" onClick={e => e.stopPropagation()}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white border-none cursor-pointer text-lg flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
        >
          ×
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-white mb-2">
            🐾 Evolution Stages
          </h2>
          <p className="text-sm text-white/80 font-medium">
            Keep your streak to unlock new forms!
          </p>
        </div>

        {/* Evolution Options */}
        <div className="flex flex-col gap-4">
          {/* Small Pup - Always available */}
          <div className="flex flex-col items-center">
            <div className="relative p-3 rounded-2xl border-2 transition-all duration-300 bg-gradient-to-br from-blue-100 to-cyan-100 border-blue-400 shadow-lg">
              <div className="text-5xl transition-all duration-300 grayscale-0">
                🐶
              </div>
              <div className="absolute -top-2 -right-2 bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                ✓
              </div>
            </div>
            <div className="text-xs font-semibold text-center mt-2 text-white drop-shadow-md">
              1 Day 🔥
            </div>
          </div>

          {/* Medium Dog - Unlocks at 2 consecutive days */}
          <div className="flex flex-col items-center">
            <div className={`relative p-4 rounded-2xl border-2 transition-all duration-300 ${
              currentStreak >= 2 
                ? 'bg-gradient-to-br from-yellow-100 to-orange-100 border-yellow-400 shadow-lg' 
                : 'bg-gray-100 border-gray-300 opacity-60'
            }`}>
              <div className={`text-6xl transition-all duration-300 ${
                currentStreak >= 2 ? 'grayscale-0' : 'grayscale'
              }`}>
                🐕
              </div>
              {currentStreak >= 2 && (
                <div className="absolute -top-2 -right-2 bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                  ✓
                </div>
              )}
            </div>
            <div className="text-xs font-semibold text-center mt-2 text-white drop-shadow-md">
              {currentStreak >= 2 ? 'Medium Dog' : '2 Days 🔥'}
            </div>
          </div>

          {/* Large Dog - Unlocks at 3 consecutive days */}
          <div className="flex flex-col items-center">
            <div className={`relative p-4 rounded-2xl border-2 transition-all duration-300 ${
              currentStreak >= 3 
                ? 'bg-gradient-to-br from-purple-100 to-pink-100 border-purple-400 shadow-lg' 
                : 'bg-gray-100 border-gray-300 opacity-60'
            }`}>
              <div className={`text-7xl transition-all duration-300 ${
                currentStreak >= 3 ? 'grayscale-0' : 'grayscale'
              }`}>
                🐺
              </div>
              {currentStreak >= 3 && (
                <div className="absolute -top-2 -right-2 bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                  ✓
                </div>
              )}
            </div>
            <div className="text-xs font-semibold text-center mt-2 text-white drop-shadow-md">
              {currentStreak >= 3 ? 'Large Dog' : '3 Days 🔥'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 