use serde::Serialize;
use std::{sync::Mutex, time::Instant};
use sysinfo::{Networks, System};
use tauri::State;

struct Sampler {
    system: System,
    networks: Networks,
    last: Instant,
}

#[derive(Default)]
pub struct SamplerState(Mutex<Option<Sampler>>);

#[derive(Serialize)]
pub struct Sample {
    cpu: f32,
    ram: f64,
    received: u64,
}

#[tauri::command]
pub async fn sample_stats(state: State<'_, SamplerState>) -> Result<Sample, String> {
    let mut slot = state.0.lock().map_err(|error| error.to_string())?;
    let sampler = slot.get_or_insert_with(|| Sampler {
        system: System::new(),
        networks: Networks::new_with_refreshed_list(),
        last: Instant::now(),
    });
    sampler.system.refresh_cpu_usage();
    sampler.system.refresh_memory();
    sampler.networks.refresh(true);
    let elapsed = sampler.last.elapsed().as_secs_f64();
    sampler.last = Instant::now();
    let received = sampler
        .networks
        .values()
        .map(|network| network.received())
        .sum::<u64>();
    Ok(Sample {
        cpu: sampler.system.global_cpu_usage(),
        ram: 100.0 * sampler.system.used_memory() as f64
            / sampler.system.total_memory().max(1) as f64,
        received: if elapsed >= 0.5 {
            (received as f64 * 0.008 / elapsed).round() as u64
        } else {
            0
        },
    })
}

#[tauri::command]
pub fn pause_stats(state: State<'_, SamplerState>) {
    if let Ok(mut slot) = state.0.lock() {
        *slot = None;
    }
}
