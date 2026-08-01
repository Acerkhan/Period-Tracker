// --- REPLACE THESE WITH YOUR SUPABASE CREDENTIALS ---
const SUPABASE_URL = "https://wfupmihrudgpegzykfao.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmdXBtaWhydWRncGVnenlrZmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1Nzc1ODIsImV4cCI6MjEwMTE1MzU4Mn0.JTwOdPoL68DpXCJZyKiIjJvCj1auIe80NtVuSNITgD8";
// ----------------------------------------------------

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const form = document.getElementById("period-form");
const startDateInput = document.getElementById("start-date");
const endDateInput = document.getElementById("end-date");
const historyList = document.getElementById("history-list");
const submitBtn = document.getElementById("submit-btn");

const currentPhaseEl = document.getElementById("current-phase");
const currentDayEl = document.getElementById("current-day");
const nextPeriodEl = document.getElementById("next-period-date");
const ovulationWindowEl = document.getElementById("ovulation-window");

document.addEventListener("DOMContentLoaded", () => {
    fetchAndRenderData();
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
        .insert([{ start_date: startDate, end_date: endDate }]);

    if (error) {
        alert("Error saving entry: " + error.message);
    } else {
        form.reset();
        await fetchAndRenderData();
    }

    submitBtn.disabled = false;
    submitBtn.textContent = "Save Period Entry";
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

    renderUI(periods || []);
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

function calculateAverageCycleLength(periods) {
    if (periods.length < 2) return 28;
    
    let totalDays = 0;
    let count = 0;
    
    for (let i = 0; i < periods.length - 1; i++) {
        const currentStart = new Date(periods[i].start_date);
        const previousStart = new Date(periods[i+1].start_date);
        const diffDays = Math.ceil(Math.abs(currentStart - previousStart) / (1000 * 60 * 60 * 24));
        
        if (diffDays >= 21 && diffDays <= 45) {
            totalDays += diffDays;
            count++;
        }
    }
    return count > 0 ? Math.round(totalDays / count) : 28;
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
        return;
    }

    periods.forEach((p) => {
        const li = document.createElement("li");
        li.className = "history-item";
        li.innerHTML = `
            <span>${formatDateString(p.start_date)} &rarr; ${formatDateString(p.end_date)}</span>
            <button class="delete-btn" onclick="deletePeriod('${p.id}')">Delete</button>
        `;
        historyList.appendChild(li);
    });

    const latestPeriod = periods[0];
    const avgCycleLength = calculateAverageCycleLength(periods);
    
    const lastStart = new Date(latestPeriod.start_date);
    const lastEnd = new Date(latestPeriod.end_date);
    const today = new Date();
    today.setHours(0,0,0,0);

    const currentDay = Math.floor((today - lastStart) / (1000 * 60 * 60 * 24)) + 1;

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
        } else if (currentDay < estimatedOvulationDay - 3) {
            currentPhaseEl.textContent = "Follicular Phase";
            currentPhaseEl.style.color = "#10b981";
        } else if (currentDay >= estimatedOvulationDay - 3 && currentDay <= estimatedOvulationDay + 1) {
            currentPhaseEl.textContent = "Ovulation Window 🌸";
            currentPhaseEl.style.color = "#0ea5e9";
        } else {
            currentPhaseEl.textContent = "Luteal Phase";
            currentPhaseEl.style.color = "#8b5cf6";
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
}
