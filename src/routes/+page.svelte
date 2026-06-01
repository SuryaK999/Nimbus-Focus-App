<script lang="ts">
	import { timer } from '$lib/stores/timer.svelte';
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	// Settings panel state
	let showSettings = $state(false);

	// Temp settings for the sliders (synchronised on save)
	let tempWork = $state(25);
	let tempShort = $state(5);
	let tempLong = $state(15);
	let tempInterval = $state(4);
	let tempSound = $state(true);
	let tempNotif = $state(true);

	// Synchronise settings when opening settings panel
	function openSettings() {
		tempWork = timer.durationWork;
		tempShort = timer.durationShortBreak;
		tempLong = timer.durationLongBreak;
		tempInterval = timer.longBreakInterval;
		tempSound = timer.soundEnabled;
		tempNotif = timer.notificationsEnabled;
		showSettings = true;
	}

	// Save settings back to the engine
	async function saveSettings() {
		timer.durationWork = tempWork;
		timer.durationShortBreak = tempShort;
		timer.durationLongBreak = tempLong;
		timer.longBreakInterval = tempInterval;
		timer.soundEnabled = tempSound;
		timer.notificationsEnabled = tempNotif;
		
		timer.resetTimer(); // Apply new times immediately
		await timer.saveSettings();
		showSettings = false;
	}

	// Format time remaining
	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}

	// Circle math for the progress ring
	// Radius: 76, Circumference: 2 * PI * 76 ≈ 477.52
	const radius = 76;
	const circumference = 2 * Math.PI * radius;
	
	// Dynamic offset based on progress
	let progressOffset = $derived(
		circumference - (timer.timeLeft / timer.totalDuration) * circumference
	);

	// Custom color theme based on timer state
	let stateTheme = $derived({
		name: timer.state === 'work' ? 'Focus' : timer.state === 'shortBreak' ? 'Short Rest' : 'Long Rest',
		colorClass: timer.state === 'work' ? 'text-violet-400' : timer.state === 'shortBreak' ? 'text-emerald-400' : 'text-blue-400',
		bgClass: timer.state === 'work' ? 'bg-violet-500/8 text-violet-300 border-violet-500/15 shadow-[0_0_15px_rgba(139,92,246,0.06)]' : timer.state === 'shortBreak' ? 'bg-emerald-500/8 text-emerald-300 border-emerald-500/15 shadow-[0_0_15px_rgba(52,211,153,0.06)]' : 'bg-blue-500/8 text-blue-300 border-blue-500/15 shadow-[0_0_15px_rgba(96,165,250,0.06)]',
		strokeGradient: timer.state === 'work' ? 'url(#focusGradient)' : timer.state === 'shortBreak' ? 'url(#shortBreakGradient)' : 'url(#longBreakGradient)',
		glowColor: timer.state === 'work' ? '#8B5CF6' : timer.state === 'shortBreak' ? '#10B981' : '#3B82F6'
	});

	// Trigger dynamic layout configurations on mount
	onMount(() => {
		// Prevent SvelteKit static adapter issues with Tauri store
		setTimeout(() => {
			timer.resetTimer();
		}, 100);
	});
</script>

<div class="relative w-[360px] h-[520px] bg-gradient-to-b from-[#11141E] to-[#08090E] border border-white/[0.07] overflow-hidden flex flex-col text-[#F5F7FA] shadow-2xl select-none">
	
	<!-- Top Bar -->
	<header class="h-[60px] px-5 flex items-center justify-between border-b border-white/[0.04] shrink-0 z-10">
		<div class="flex items-center gap-2">
			<!-- Logo Image -->
			<img src="/logo.png" alt="Nimbus Logo" class="w-6 h-6 rounded-md shadow-lg border border-white/[0.1] object-cover" />
			<span class="font-outfit font-bold text-base tracking-wider uppercase text-white shadow-sm">Nimbus</span>
		</div>

		<!-- State Badge -->
		<div class="px-3.5 py-1 text-[10px] font-bold rounded-full border tracking-widest uppercase {stateTheme.bgClass} transition-all duration-300">
			{stateTheme.name}
		</div>

		<!-- Settings Gear Button -->
		<button 
			onclick={openSettings}
			class="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/[0.04] active:scale-95 transition-all duration-200"
			aria-label="Open Settings"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="w-4.5 h-4.5 hover:rotate-45 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
			</svg>
		</button>
	</header>

	<!-- Main Body (Timer + Controls + Stats) -->
	<main class="flex-1 flex flex-col justify-between p-6 overflow-hidden">
		
		<!-- Timer Display Container -->
		<div class="relative flex flex-col items-center justify-center py-2">
			
			<!-- Pulsing background aura glow when running -->
			{#if timer.status === 'running'}
				<div 
					transition:fade={{ duration: 400 }}
					class="absolute w-[170px] h-[170px] rounded-full filter blur-[24px] opacity-10 pointer-events-none animate-pulse transition-all duration-700"
					style="background-color: {stateTheme.glowColor};"
				></div>
			{/if}

			<!-- SVG Progress Ring Container -->
			<div class="relative w-[184px] h-[184px] flex items-center justify-center">
				<svg class="absolute inset-0 w-full h-full rotate-[-90deg]">
					<defs>
						<!-- Custom Multi-stop Gradients for Ring -->
						<linearGradient id="focusGradient" x1="0%" y1="0%" x2="100%" y2="100%">
							<stop offset="0%" stop-color="#C084FC" /> <!-- Light Purple -->
							<stop offset="100%" stop-color="#8B5CF6" /> <!-- Hot Purple -->
						</linearGradient>
						<linearGradient id="shortBreakGradient" x1="0%" y1="0%" x2="100%" y2="100%">
							<stop offset="0%" stop-color="#34D399" /> <!-- Emerald -->
							<stop offset="100%" stop-color="#059669" /> <!-- Deep Green -->
						</linearGradient>
						<linearGradient id="longBreakGradient" x1="0%" y1="0%" x2="100%" y2="100%">
							<stop offset="0%" stop-color="#60A5FA" /> <!-- Sky Blue -->
							<stop offset="100%" stop-color="#2563EB" /> <!-- Royal Blue -->
						</linearGradient>
					</defs>

					<!-- Static Track Circle -->
					<circle
						cx="92"
						cy="92"
						r={radius}
						stroke="rgba(255, 255, 255, 0.03)"
						stroke-width="6"
						fill="transparent"
					/>
					<!-- Active Progress Circle -->
					<circle
						cx="92"
						cy="92"
						r={radius}
						stroke={stateTheme.strokeGradient}
						stroke-width="6"
						fill="transparent"
						stroke-dasharray={circumference}
						stroke-dashoffset={progressOffset}
						stroke-linecap="round"
						style="transition: stroke-dashoffset 0.35s cubic-bezier(0.4, 0, 0.2, 1); filter: drop-shadow(0 0 5px rgba(255,255,255,0.08));"
					/>
				</svg>

				<!-- Center Text Panel inside Ring -->
				<div class="absolute inset-0 flex flex-col items-center justify-center">
					<span class="text-4xl font-bold tracking-tight leading-none font-outfit select-all transition-all duration-300 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] {timer.status === 'running' ? 'scale-[1.03]' : ''}">
						{formatTime(timer.timeLeft)}
					</span>
					
					<!-- Running status indicator badge -->
					<div class="flex items-center justify-center mt-2.5">
						{#if timer.status === 'running'}
							<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping mr-1.5"></span>
							<span class="text-[9px] font-bold tracking-widest text-emerald-400 uppercase">Focusing</span>
						{:else if timer.status === 'paused'}
							<span class="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5"></span>
							<span class="text-[9px] font-bold tracking-widest text-amber-400 uppercase">Paused</span>
						{:else}
							<span class="w-1.5 h-1.5 rounded-full bg-violet-400 mr-1.5"></span>
							<span class="text-[9px] font-bold tracking-widest text-violet-400 uppercase">Ready</span>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- Action Controls -->
		<div class="flex items-center justify-center gap-5 py-3">
			<!-- Reset Button -->
			<button 
				onclick={() => timer.resetTimer()}
				class="w-11 h-11 flex items-center justify-center bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08] hover:border-white/[0.15] text-gray-300 hover:text-white rounded-full active:scale-90 shadow-md hover:shadow-lg transition-all duration-250 shrink-0"
				title="Reset Timer"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="w-5.5 h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
					<path d="M3 3v5h5" />
				</svg>
			</button>

			<!-- Start/Pause Action Pill -->
			{#if timer.status === 'running'}
				<button 
					onclick={() => timer.pauseTimer()}
					class="px-9 h-12 flex items-center justify-center gap-2 bg-[#161922] border border-white/[0.08] hover:bg-[#1f2330] hover:border-white/[0.12] text-white font-semibold rounded-full active:scale-95 shadow-xl transition-all duration-200 shrink-0"
				>
					<!-- Pause SVG -->
					<svg xmlns="http://www.w3.org/2000/svg" class="w-4.5 h-4.5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
						<path stroke-linecap="round" stroke-linejoin="round" d="M10 9v6m4-6v6" />
					</svg>
					<span class="text-sm tracking-wide">Pause</span>
				</button>
			{:else}
				<button 
					onclick={() => timer.startTimer()}
					class="px-9 h-12 flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold rounded-full active:scale-95 shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all duration-200 shrink-0"
				>
					<!-- Play SVG -->
					<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 fill-current" viewBox="0 0 24 24">
						<path d="M8 5v14l11-7z" />
					</svg>
					<span class="text-sm tracking-wide">{timer.status === 'paused' ? 'Resume' : 'Focus'}</span>
				</button>
			{/if}

			<!-- Skip Button -->
			<button 
				onclick={() => timer.skipSession()}
				class="w-11 h-11 flex items-center justify-center bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08] hover:border-white/[0.15] text-gray-300 hover:text-white rounded-full active:scale-90 shadow-md hover:shadow-lg transition-all duration-250 shrink-0"
				title="Skip Session"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="w-5.5 h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
					<polygon points="5 4 15 12 5 20 5 4" />
					<line x1="19" y1="5" x2="19" y2="19" />
				</svg>
			</button>
		</div>

		<!-- Stats Grid Dashboard -->
		<footer class="grid grid-cols-2 gap-4 mt-2 shrink-0">
			<!-- Completed Sessions Stats -->
			<div class="bg-[#141722] border border-white/[0.06] hover:border-white/[0.12] rounded-xl p-3.5 flex flex-col justify-between h-[72px] transition-all duration-300 shadow-md">
				<span class="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Sessions</span>
				<div class="flex items-baseline justify-between mt-1">
					<span class="text-2xl font-bold font-outfit text-white leading-none">{timer.completedSessions}</span>
					<span class="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/12">Today</span>
				</div>
			</div>

			<!-- Streak Stats -->
			<div class="bg-[#141722] border border-white/[0.06] hover:border-white/[0.12] rounded-xl p-3.5 flex flex-col justify-between h-[72px] transition-all duration-300 shadow-md">
				<span class="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Active Streak</span>
				<div class="flex items-baseline justify-between mt-1">
					<span class="text-2xl font-bold font-outfit text-white flex items-center gap-1.5 leading-none">
						<svg xmlns="http://www.w3.org/2000/svg" class="w-4.5 h-4.5 text-orange-500 fill-current filter drop-shadow-[0_0_3px_rgba(249,115,22,0.4)]" viewBox="0 0 24 24">
							<path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
							<path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
						{timer.dailyStreak}
					</span>
					<span class="text-[9px] text-gray-400 font-medium">days</span>
				</div>
			</div>
		</footer>
	</main>

	<!-- Sliding Glass Settings Overlay Panel -->
	{#if showSettings}
		<div 
			transition:fade={{ duration: 150 }}
			class="absolute inset-0 bg-black/65 z-40 backdrop-blur-[3px]"
			onclick={() => showSettings = false}
			onkeydown={(e) => e.key === 'Escape' && (showSettings = false)}
			role="button"
			tabindex="0"
		></div>

		<div 
			transition:fly={{ y: 400, duration: 280, easing: cubicOut }}
			class="absolute bottom-0 inset-x-0 bg-[#0E1119] border-t border-white/[0.08] rounded-t-2xl z-50 p-6 flex flex-col shadow-2xl h-[440px]"
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-white/[0.04] pb-3.5 mb-4 shrink-0">
				<h3 class="font-outfit font-bold text-base text-white tracking-wide">Timer Configuration</h3>
				<button 
					onclick={() => showSettings = false}
					class="p-1 hover:bg-white/[0.04] rounded-lg text-gray-400 hover:text-white transition-all duration-200"
					aria-label="Close Settings"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Settings Scrollable Content (Custom scroll configured) -->
			<div class="flex-1 overflow-y-auto space-y-4 pr-1 custom-scroll text-sm">
				
				<!-- Sliders list -->
				<div class="space-y-4 py-1">
					<!-- Focus Duration -->
					<div>
						<div class="flex justify-between text-xs mb-1.5">
							<span class="text-gray-400 font-semibold uppercase tracking-wider">Focus Period</span>
							<span class="text-violet-400 font-bold">{tempWork} minutes</span>
						</div>
						<input 
							type="range" min="10" max="60" step="5"
							bind:value={tempWork}
						/>
					</div>

					<!-- Short Break Duration -->
					<div>
						<div class="flex justify-between text-xs mb-1.5">
							<span class="text-gray-400 font-semibold uppercase tracking-wider">Short Rest</span>
							<span class="text-emerald-400 font-bold">{tempShort} minutes</span>
						</div>
						<input 
							type="range" min="1" max="15" step="1"
							bind:value={tempShort}
						/>
					</div>

					<!-- Long Break Duration -->
					<div>
						<div class="flex justify-between text-xs mb-1.5">
							<span class="text-gray-400 font-semibold uppercase tracking-wider">Long Rest</span>
							<span class="text-blue-400 font-bold">{tempLong} minutes</span>
						</div>
						<input 
							type="range" min="5" max="30" step="5"
							bind:value={tempLong}
						/>
					</div>

					<!-- Long Break Interval -->
					<div>
						<div class="flex justify-between text-xs mb-1.5">
							<span class="text-gray-400 font-semibold uppercase tracking-wider">Long Rest Interval</span>
							<span class="text-gray-300 font-bold">{tempInterval} cycles</span>
						</div>
						<input 
							type="range" min="2" max="8" step="1"
							bind:value={tempInterval}
						/>
					</div>
				</div>

				<!-- Sound and Notification Switches -->
				<div class="border-t border-white/[0.04] pt-4 mt-5 space-y-4">
					
					<!-- Sound Alert Switch -->
					<div class="flex items-center justify-between">
						<div class="flex flex-col pr-4">
							<span class="text-xs font-bold text-gray-200 uppercase tracking-wider">Ambient Audio Alerts</span>
							<span class="text-[10px] text-gray-400 mt-0.5">Strum warm meditative zither chime</span>
						</div>
						<button 
							onclick={() => tempSound = !tempSound}
							class="w-10 h-5 rounded-full relative transition-all duration-300 border border-white/[0.1] {tempSound ? 'bg-violet-600' : 'bg-white/[0.03]'}"
							aria-label="Toggle sound alerts"
						>
							<div class="w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all duration-300 {tempSound ? 'left-[23px]' : 'left-[3px]'}"></div>
						</button>
					</div>

					<!-- Native Notifications Switch -->
					<div class="flex items-center justify-between">
						<div class="flex flex-col pr-4">
							<span class="text-xs font-bold text-gray-200 uppercase tracking-wider">Desktop Notifications</span>
							<span class="text-[10px] text-gray-400 mt-0.5">Send native system prompt reminders</span>
						</div>
						<button 
							onclick={() => tempNotif = !tempNotif}
							class="w-10 h-5 rounded-full relative transition-all duration-300 border border-white/[0.1] {tempNotif ? 'bg-violet-600' : 'bg-white/[0.03]'}"
							aria-label="Toggle notifications"
						>
							<div class="w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all duration-300 {tempNotif ? 'left-[23px]' : 'left-[3px]'}"></div>
						</button>
					</div>
				</div>
			</div>

			<!-- Save button in settings -->
			<button 
				onclick={saveSettings}
				class="w-full h-11 mt-4 flex items-center justify-center bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 active:scale-95 text-white font-bold rounded-xl shadow-lg shadow-violet-500/10 transition-all duration-200 shrink-0 tracking-wide text-sm"
			>
				Save & Apply Settings
			</button>
		</div>
	{/if}
</div>

<style>
	/* Custom Premium Scrollbar for Settings Panel */
	.custom-scroll::-webkit-scrollbar {
		width: 4px;
	}
	.custom-scroll::-webkit-scrollbar-track {
		background: transparent;
	}
	.custom-scroll::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.08);
		border-radius: 99px;
		transition: background-color 0.2s ease;
	}
	.custom-scroll::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.16);
	}

	/* Ultra-premium Range Sliders */
	input[type="range"] {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		background: transparent;
		outline: none;
	}
	input[type="range"]::-webkit-slider-runnable-track {
		width: 100%;
		height: 4px;
		background: rgba(255, 255, 255, 0.06);
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.02);
	}
	input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		height: 12px;
		width: 12px;
		border-radius: 50%;
		background: #FFFFFF;
		cursor: pointer;
		margin-top: -4px;
		box-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.8);
		transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.15s ease, box-shadow 0.15s ease;
	}
	input[type="range"]::-webkit-slider-thumb:hover {
		transform: scale(1.35);
		background: #8B5CF6;
		box-shadow: 0 0 12px rgba(139, 92, 246, 0.6);
		border-color: rgba(139, 92, 246, 0.4);
	}
	input[type="range"]:active::-webkit-slider-thumb {
		transform: scale(1.2);
	}
</style>
