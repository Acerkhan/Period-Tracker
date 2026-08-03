// --- REPLACE THESE WITH YOUR SUPABASE CREDENTIALS ---
const SUPABASE_URL = "https://wfupmihrudgpegzykfao.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmdXBtaWhydWRncGVnenlrZmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1Nzc1ODIsImV4cCI6MjEwMTE1MzU4Mn0.JTwOdPoL68DpXCJZyKiIjJvCj1auIe80NtVuSNITgD8";
// ----------------------------------------------------

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const form = document.getElementById("period-form");
const actionTypeSelect = document.getElementById("action-type");
const singleDateInput = document.getElementById("single-date");
const dateLabel = document.getElementById("date-label");

const flowInput = document.getElementById("flow-intensity");
const severityInput = document.getElementById("symptom-severity");
const moodInput = document.getElementById("mood-select");
const symptomsInput = document.getElementById("symptoms-input");

const historyList = document.getElementById("history-list");
const submitBtn = document.getElementById("submit-btn");

const currentPhaseEl = document.getElementById("current-phase");
const currentDayEl = document.getElementById("current-day");
const nextPeriodEl = document.getElementById("next-period-date");
const ovulationWindowEl = document.getElementById("ovulation-window");
const tipsCard = document.getElementById("tips-card");
const phaseTipsContent = document.getElementById("phase-tips-content");

let globalPeriodsCache = [];
let globalDailyLogsCache = [];

document.addEventListener("DOMContentLoaded", () => {
    fetchAndRenderData();
    if (actionTypeSelect) {
        actionTypeSelect.addEventListener("change", updateFormLabels);
    }
});

function updateFormLabels() {
    const val = actionTypeSelect.value;
    if (val === "start") {
        dateLabel.textContent = "Period Start Date";
    } else if (val === "end") {
        dateLabel.textContent = "Period End Date";
    } else {
        dateLabel.textContent = "Daily Log Date";
    }
}

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const action = actionTypeSelect.value;
    const selectedDate = singleDateInput.value;

    if (!selectedDate) {
        alert("Please select a valid date.");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Saving to Cloud...";

    try {
        const flowVal = flowInput && flowInput.value !== "-- None / N/A --" ? flowInput.value : null;
        const severityVal = severityInput && severityInput.value !== "Mild / None" ? severityInput.value : null;
        const moodVal = moodInput ? moodInput.value : null;
        const symptomsVal = symptomsInput ? symptomsInput.value : null;

        if (action === "start") {
            // Insert into macro periods table
            const { error: periodError } = await db
                .from('periods')
                .insert([{ start_date: selectedDate, end_date: null }]);
            if (periodError) throw periodError;

            // Also auto-log day 1 in daily logs if details provided
            if (flowVal || severityVal || moodVal || symptomsVal) {
                await upsertDailyLog(selectedDate, flowVal, severityVal, moodVal, symptomsVal);
            }
        } 
        else if (action === "end") {
            const latestOpen = globalPeriodsCache.find(p => !p.end_date);
            if (!latestOpen) {
                alert("No active period found without an end date. Please log a 'Start Date' first!");
            } else {
                const { error } = await db
                    .from('periods')
                    .update({ end_date: selectedDate })
                    .eq('id', latestOpen.id);
                if (error) throw error;
            }
        } 
        else {
            // Log/Update standalone daily check-in
            await upsertDailyLog(selectedDate, flowVal, severityVal, moodVal, symptomsVal);
        }

        form.reset();
        updateFormLabels();
        await fetchAndRenderData();
    } catch (err) {
        alert("Error saving entry: " + (err.message || err));
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Save Entry";
    }
});

async function upsertDailyLog(dateStr, flow, severity, mood, symptoms) {
    const { error } = await db
        .from('daily_logs')
        .upsert([{ 
            log_date: dateStr, 
            flow: flow, 
            severity: severity, 
            mood: mood, 
            symptoms: symptoms 
        }], { onConflict: 'log_date' });

    if (error) throw error;
}

async function fetchAndRenderData() {
    try {
        const [periodsRes, logsRes] = await Promise.all([
            db.from('periods').select('*').order('start_date', { ascending: false }),
            db.from('daily_logs').select('*').order('log_date', { ascending: false })
        ]);

        if (periodsRes.error) throw periodsRes.error;
        if (logsRes.error) throw logsRes.error;

        globalPeriodsCache = periodsRes.data || [];
        globalDailyLogsCache = logsRes.data || [];
        
        renderUI(globalPeriodsCache, globalDailyLogsCache);
    } catch (err) {
        historyList.innerHTML = `<li class="empty-state" style="color:red;">Failed to load data: ${err.message || err}</li>`;
        currentPhaseEl.textContent = "Error";
    }
}

window.deletePeriod = async function(id) {
    if (!confirm("Are you sure you want to delete this period cycle?")) return;
    const { error } = await db.from('periods').delete().eq('id', id);
    if (error) alert("Error deleting: " + error.message);
    else fetchAndRenderData();
}

window.deleteLog = async function(id) {
    if (!confirm("Are you sure you want to delete this daily log?")) return;
    const { error } = await db.from('daily_logs').delete().eq('id', id);
    if (error) alert("Error deleting: " + error.message);
    else fetchAndRenderData();
}

function calculateAdaptiveCycleLength(periods) {
    if (!periods || periods.length < 2) return 28;
    
    let cycleDiffs = [];
    for (let i = 0; i < periods.length - 1; i++) {
        if (!periods[i].start_date || !periods[i+1].start_date) continue;
        const currentStart = new Date(periods[i].start_date);
        const previousStart = new Date(periods[i+1].start_date);
        const diffDays = Math.round(Math.abs(currentStart - previousStart) / (1000 * 60 * 60 * 24));
        if (diffDays >= 21 && diffDays <= 45) {
            cycleDiffs.push(diffDays);
        }
    }

    if (cycleDiffs.length === 0) return 28;
    const sum = cycleDiffs.reduce((a, b) => a + b, 0);
    return Math.round(sum / cycleDiffs.length);
}

function formatDateString(dateStr) {
    if (!dateStr) return "Ongoing 🔄";
    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    return new Date(dateStr).toLocaleDateString(undefined, options);
}

function renderUI(periods, logs) {
    historyList.innerHTML = "";
    
    if ((!periods || periods.length === 0) && (!logs || logs.length === 0)) {
        historyList.innerHTML = `<li class="empty-state">No cycle data found. Log your first dates above.</li>`;
        currentPhaseEl.textContent = "No Data";
        currentDayEl.textContent = "-";
        nextPeriodEl.textContent = "-";
        ovulationWindowEl.textContent = "-";
        if (tipsCard) tipsCard.style.display = "none";
        return;
    }

    // Render Periods History
    periods.forEach((p) => {
        const li = document.createElement("li");
        li.className = "history-item";
        li.innerHTML = `
            <div class="history-details">
                <span>🩸 <strong>Period Range:</strong> ${formatDateString(p.start_date)} &rarr; ${formatDateString(p.end_date)}</span>
            </div>
            <button class="delete-btn" onclick="deletePeriod('${p.id}')">Delete</button>
        `;
        historyList.appendChild(li);
    });

    // Render Daily Logs History
    logs.forEach((l) => {
        const li = document.createElement("li");
        li.className = "history-item";
        let tagsHtml = `<span class="tag">📅 ${formatDateString(l.log_date)}</span>`;
        if (l.flow) tagsHtml += `<span class="tag">Flow: ${l.flow}</span>`;
        if (l.severity && l.severity !== 'Mild / None') tagsHtml += `<span class="tag">Cramps: ${l.severity}</span>`;
        if (l.mood) tagsHtml += `<span class="tag">Mood: ${l.mood}</span>`;
        if (l.symptoms) {
            l.symptoms.split(',').map(s => s.trim()).filter(s => s.length > 0).forEach(s => {
                tagsHtml += `<span class="tag">${s}</span>`;
            });
        }

        li.innerHTML = `
            <div class="history-details">
                <div class="tags">${tagsHtml}</div>
            </div>
            <button class="delete-btn" onclick="deleteLog('${l.id}')">Delete</button>
        `;
        historyList.appendChild(li);
    });

    if (!periods || periods.length === 0) return;

    const latestPeriod = periods[0];
    const avgCycleLength = calculateAdaptiveCycleLength(periods);
    
    const lastStart = new Date(latestPeriod.start_date);
    const lastEnd = latestPeriod.end_date ? new Date(latestPeriod.end_date) : null;
    const today = new Date();
    today.setHours(0,0,0,0);

    const currentDay = Math.floor((today - lastStart) / (1000 * 60 * 60 * 24)) + 1;

    let currentPhaseKey = "";
    if (currentDay < 1) {
        currentPhaseEl.textContent = "Menstrual Phase";
        currentPhaseEl.style.color = "#f43f5e";
        currentDayEl.textContent = "Day 1";
        currentPhaseKey = "menstrual";
    } else {
        currentDayEl.textContent = `Day ${currentDay}`;
        
        const bleedingDays = lastEnd 
            ? Math.max(Math.floor((lastEnd - lastStart)/(1000*60*60*24)) + 1, 5)
            : 5;
            
        const estimatedOvulationDay = avgCycleLength - 14;

        if (currentDay <= bleedingDays) {
            currentPhaseEl.textContent = "Menstrual Phase";
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
    nextPeriodEl.textContent = formatDateString(nextPeriodDate);

    const ovulationDate = new Date(nextPeriodDate);
    ovulationDate.setDate(ovulationDate.getDate() - 14);
    
    const fertileStart = new Date(ovulationDate);
    fertileStart.setDate(ovulationDate.getDate() - 3);
    
    const fertileEnd = new Date(ovulationDate);
    fertileEnd.setDate(ovulationDate.getDate() + 1);

    ovulationWindowEl.textContent = `${formatDateString(fertileStart)} – ${formatDateString(fertileEnd)}`;

    // Check today's specific log for dynamic tip adjustments
    const todayString = today.toISOString().split('T')[0];
    const todayLog = logs.find(l => l.log_date === todayString);
    renderDynamicTips(currentPhaseKey, todayLog);
}

function renderDynamicTips(phase, todayLog) {
    if (tipsCard) tipsCard.style.display = "block";
    
    let baseTips = {
        menstrual: "Take it easy today! Drink plenty of warm water, enjoy cozy comfort foods, use a heating pad if needed, and get extra rest to help your body recharge.",
        follicular: "Your energy is starting to bounce back! This is a great time to tackle new tasks, go for walks, catch up with friends, and start fresh projects.",
        ovulation: "You are likely feeling your best and most social right now! Enjoy higher energy levels, great moods, and make time for fun activities.",
        luteal: "You might notice energy slowing down a bit as your body prepares for the next cycle. Focus on comforting meals, relaxing wind-down routines, and gentle self-care."
    };

    let customTip = baseTips[phase] || "Keep tracking your daily updates to receive customized wellness tips!";

    // Tailor tips based on logged daily symptoms/severity
    if (todayLog) {
        if (todayLog.severity === "Severe" || todayLog.severity === "Moderate") {
            customTip += " 💡 Note: Since you're dealing with notable cramps today, try magnesium-rich foods (like dark chocolate or bananas), herbal chamomile tea, and gentle lower-back stretches.";
        }
        if (todayLog.flow === "Heavy") {
            customTip += " 💧 Heavy flow noted today: Remember to stay extra hydrated and prioritize iron-rich nutrition.";
        }
        if (todayLog.mood === "Anxious / Stressed" || todayLog.mood === "Irritable") {
            customTip += " 🌿 For mood support, try a 10-minute breathing exercise or a quiet walk outside to lower cortisol levels.";
        }
    }

    if (phaseTipsContent) {
        phaseTipsContent.textContent = customTip;
    }
}
