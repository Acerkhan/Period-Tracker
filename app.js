// --- REPLACE THESE WITH YOUR SUPABASE CREDENTIALS ---
const SUPABASE_URL = "https://wfupmihrudgpegzykfao.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmdXBtaWhydWRncGVnenlrZmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1Nzc1ODIsImV4cCI6MjEwMTE1MzU4Mn0.JTwOdPoL68DpXCJZyKiIjJvCj1auIe80NtVuSNITgD8";
// ----------------------------------------------------
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const form = document.getElementById("period-form");
const startDateInput = document.getElementById("start-date");
const endDateInput = document.getElementById("end-date");
const flowInput = document.getElementById("flow-intensity");
const moodInput = document.getElementById("mood-select");
const symptomsInput = document.getElementById("symptoms-input");
const predictionModeSelect = document.getElementById("prediction-mode");

const historyList = document.getElementById("history-list");
const submitBtn = document.getElementById("submit-btn");

const currentPhaseEl = document.getElementById("current-phase");
const currentDayEl = document.getElementById("current-day");
const nextPeriodEl = document.getElementById("next-period-date");
const ovulationWindowEl = document.getElementById("ovulation-window");
const tipsCard = document.getElementById("tips-card");
const phaseTipsContent = document.getElementById("phase-tips-content");

let globalPeriodsCache = [];

document.addEventListener("DOMContentLoaded", () => {
    fetchAndRenderData();
});

// Re-render immediately when the dropdown selection changes
predictionModeSelect.addEventListener("change", () => {
    if (globalPeriodsCache.length > 0) {
        renderUI(globalPeriodsCache);
    }
});

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;

    if (new Date(startDate) > new Date(endDate)) {
        alert("Start date cannot be after the end date.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Saving to Cloud...";

    const { error } = await db
        .from('periods')
        .insert([{ 
            start_date: startDate, 
            end_date: endDate,
            flow: flowInput.value,
            mood: moodInput.value,
            symptoms: symptomsInput.value ? symptomsInput.value.split(',').map(s => s.trim()) : []
        }]);

    if (error) {
        alert("Error saving entry: " + error.message);
    } else {
        form.reset();
        await fetchAndRenderData();
    }

    submitBtn.disabled = false;
    submitBtn.textContent = "Save Period & Log Entry";
});

async function fetchAndRenderData() {
    const { data: periods, error } = await db
        .from('periods')
        .select('*')
        .order('start_date', { ascending: false });

    if (error) {
        historyList.innerHTML = `<li class="empty-state" style="color:red;">Failed to load data: ${error.message}</li>`;
        return;
    }

    globalPeriodsCache = periods || [];
    renderUI(globalPeriodsCache);
}

window.deletePeriod = async function(id) {
    if (!confirm("Are you sure you want to delete this entry?")) return;

    const { error } = await db
        .from('periods')
        .delete()
        .eq('id', id);

    if (error) {
        alert("Error deleting: " + error.message);
    } else {
        fetchAndRenderData();
    }
}

function calculateCycleLength(periods, mode) {
    if (periods.length < 2) return 28;
    
    let cycleDiffs = [];
    for (let i = 0; i < periods.length - 1; i++) {
        const currentStart = new Date(periods[i].start_date);
        const previousStart = new Date(periods[i+1].start_date);
        const diffDays = Math.ceil(Math.abs(currentStart - previousStart) / (1000 * 60 * 60 * 24));
        if (diffDays >= 21 && diffDays <= 45) {
            cycleDiffs.push(diffDays);
        }
    }

    if (cycleDiffs.length === 0) return 28;

    // Adjust calculation logic based on the dropdown selection
    if (mode === "regular") {
        // Return minimum standard deviation or strict average of last 2
        return cycleDiffs[0]; 
    } else if (mode === "irregular") {
        // Add a safety buffer to account for variance (+2 days)
        const rawAvg = cycleDiffs.reduce((a, b) => a + b, 0) / cycleDiffs.length;
        return Math.round(rawAvg + 2);
    } else {
        // Standard Weighted Average (default)
        if (cycleDiffs.length >= 3) {
            return Math.round((cycleDiffs[0] * 3 + cycleDiffs[1] * 2 + cycleDiffs[2] * 1) / 6);
        }
        const sum = cycleDiffs.reduce((a, b) => a + b, 0);
        return Math.round(sum / cycleDiffs.length);
    }
}

function formatDateString(dateStr) {
    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    return new Date(dateStr).toLocaleDateString(undefined, options);
}

function renderUI(periods) {
    historyList.innerHTML = "";
    if (periods.length === 0) {
        historyList.innerHTML = `<li class="empty-state">No cycle data found in Supabase. Log your first dates above.</li>`;
        currentPhaseEl.textContent = "No Data";
        currentDayEl.textContent = "-";
        nextPeriodEl.textContent = "-";
        ovulationWindowEl.textContent = "-";
        tipsCard.style.display = "none";
        return;
    }

    periods.forEach((p) => {
        const li = document.createElement("li");
        li.className = "history-item";
        
        let tagsHtml = '';
        if (p.flow) tagsHtml += `<span class="tag">Flow: ${p.flow}</span>`;
        if (p.mood) tagsHtml += `<span class="tag">Mood: ${p.mood}</span>`;
        if (p.symptoms && p.symptoms.length > 0) {
            p.symptoms.forEach(s => tagsHtml += `<span class="tag">${s}</span>`);
        }

        li.innerHTML = `
            <div class="history-details">
                <span><strong>${formatDateString(p.start_date)}</strong> &rarr; ${formatDateString(p.end_date)}</span>
                <div class="tags">${tagsHtml}</div>
            </div>
            <button class="delete-btn" onclick="deletePeriod('${p.id}')">Delete</button>
        `;
        historyList.appendChild(li);
    });

    const latestPeriod = periods[0];
    const selectedMode = predictionModeSelect.value;
    const avgCycleLength = calculateCycleLength(periods, selectedMode);
    
    const lastStart = new Date(latestPeriod.start_date);
    const lastEnd = new Date(latestPeriod.end_date);
    const today = new Date();
    today.setHours(0,0,0,0);

    const currentDay = Math.floor((today - lastStart) / (1000 * 60 * 60 * 24)) + 1;

    let currentPhaseKey = "";
    if (currentDay < 1) {
        currentPhaseEl.textContent = "Upcoming Cycle";
        currentDayEl.textContent = "Not started";
    } else {
        currentDayEl.textContent = `Day ${currentDay}`;
        
        const bleedingDays = Math.max(
            Math.floor((lastEnd - lastStart)/(1000*60*60*24)) + 1, 
            5
        );
        const estimatedOvulationDay = avgCycleLength - 14;

        if (currentDay <= bleedingDays) {
            currentPhaseEl.textContent = "Menstrual Phase (Period)";
            currentPhaseEl.style.color = "#f43f5e";
            currentPhaseKey = "menstrual";
        } else if (currentDay < estimatedOvulationDay - 3) {
            currentPhaseEl.textContent = "Follicular Phase";
            currentPhaseEl.style.color = "#10b981";
            currentPhaseKey = "follicular";
        } else if (currentDay >= estimatedOvulationDay - 3 && currentDay <= estimatedOvulationDay + 1) {
            currentPhaseEl.textContent = "Ovulation Window 🌸";
            currentPhaseEl.style.color = "#0ea5e9";
            currentPhaseKey = "ovulation";
        } else {
            currentPhaseEl.textContent = "Luteal Phase";
            currentPhaseEl.style.color = "#8b5cf6";
            currentPhaseKey = "luteal";
        }
    }

    const nextPeriodDate = new Date(lastStart);
    nextPeriodDate.setDate(nextPeriodDate.getDate() + avgCycleLength);
    
    // If irregular mode is selected, show a range/buffer for transparency
    if (selectedMode === "irregular") {
        const altPeriodDate = new Date(nextPeriodDate);
        altPeriodDate.setDate(altPeriodDate.getDate() + 3);
        nextPeriodEl.textContent = `${formatDateString(nextPeriodDate)} – ${formatDateString(altPeriodDate)}`;
    } else {
        nextPeriodEl.textContent = formatDateString(nextPeriodDate);
    }

    const ovulationDate = new Date(nextPeriodDate);
    ovulationDate.setDate(ovulationDate.getDate() - 14);
    
    const fertileStart = new Date(ovulationDate);
    fertileStart.setDate(ovulationDate.getDate() - 3);
    
    const fertileEnd = new Date(ovulationDate);
    fertileEnd.setDate(ovulationDate.getDate() + 1);

    ovulationWindowEl.textContent = `${formatDateString(fertileStart)} – ${formatDateString(fertileEnd)}`;

    renderPhaseTips(currentPhaseKey);
}

function renderPhaseTips(phase) {
    tipsCard.style.display = "block";
    const tips = {
        menstrual: "<strong>Rest & Nourish:</strong> Energy levels are naturally lower. Focus on iron-rich foods, warm herbal teas, gentle stretching, and adequate rest to support recovery.",
        follicular: "<strong>Energy Rising:</strong> Estrogen is climbing back up. Great time for starting new projects, higher-intensity workouts, socializing, and creative brainstorming.",
        ovulation: "<strong>Peak Energy & Glow:</strong> Communication and confidence are typically at their highest. Ideal for important conversations, active workouts, and social events.",
        luteal: "<strong>Wind Down & Care:</strong> Progesterone peaks then drops, which can cause cravings or fatigue. Prioritize complex carbs, magnesium-rich snacks, self-care, and stress reduction."
    };
    phaseTipsContent.innerHTML = tips[phase] || "Track consistently to get tailored phase recommendations.";
}
