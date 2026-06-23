//! LAN peer discovery over mDNS.
//!
//! We advertise a `_beam._tcp` service whose TXT records carry our friendly
//! name and stable id, and we browse the same service type to build a live
//! table of peers. Every change emits `devices-changed` to the frontend.

use std::collections::HashMap;

use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use tauri::{AppHandle, Emitter};

use crate::protocol::Device;
use crate::state::{AppState, MdnsHandle};

/// The mDNS service type Beam instances advertise and browse for.
const SERVICE_TYPE: &str = "_beam._tcp.local.";

/// Start advertising ourselves and browsing for peers.
///
/// `port` is the TCP port our receive listener is bound to — peers dial it
/// directly. Must be called after the listener is bound so the advertised port
/// is correct.
pub fn start(
    app: AppHandle,
    state: AppState,
    port: u16,
    device_name: String,
) -> Result<(), String> {
    let daemon = ServiceDaemon::new().map_err(|e| format!("mDNS daemon: {e}"))?;

    // A stable, unique-on-the-network host/instance derived from our id. The
    // *friendly* name lives in the TXT records, so renaming never collides.
    let short = &state.inner.our_id[..8];
    let host_name = format!("beam-{short}.local.");

    let service = build_service(&host_name, short, port, &device_name, &state.inner.our_id)?;
    daemon
        .register(service)
        .map_err(|e| format!("mDNS register: {e}"))?;

    let browse = daemon
        .browse(SERVICE_TYPE)
        .map_err(|e| format!("mDNS browse: {e}"))?;

    // Keep the daemon (and the bits needed to re-advertise on rename) alive.
    *state.inner.mdns.lock().unwrap() = Some(MdnsHandle {
        daemon,
        host_name,
        port,
    });

    // The browse channel is a blocking flume receiver, so drive it on a plain
    // OS thread rather than tying up a tokio worker.
    std::thread::spawn(move || browse_loop(app, state, browse));
    Ok(())
}

/// Re-advertise with a new friendly name. Reuses the existing daemon, so the
/// rename propagates without a restart.
pub fn reregister_name(state: &AppState, new_name: &str) -> Result<(), String> {
    let guard = state.inner.mdns.lock().unwrap();
    let Some(handle) = guard.as_ref() else {
        return Ok(()); // discovery not running yet; the new name persists for next launch
    };
    let short = &state.inner.our_id[..8];
    let service = build_service(
        &handle.host_name,
        short,
        handle.port,
        new_name,
        &state.inner.our_id,
    )?;
    handle
        .daemon
        .register(service)
        .map_err(|e| format!("mDNS re-register: {e}"))
}

/// Build a `ServiceInfo` with addresses auto-detected from local interfaces.
fn build_service(
    host_name: &str,
    instance: &str,
    port: u16,
    name: &str,
    id: &str,
) -> Result<ServiceInfo, String> {
    let mut props = HashMap::new();
    props.insert("name".to_string(), name.to_string());
    props.insert("id".to_string(), id.to_string());

    ServiceInfo::new(SERVICE_TYPE, instance, host_name, "", port, props)
        .map(|info| info.enable_addr_auto())
        .map_err(|e| format!("mDNS service info: {e}"))
}

/// Consume browse events for the life of the process, keeping the shared peer
/// table in sync and emitting `devices-changed` on every change.
fn browse_loop(app: AppHandle, state: AppState, browse: mdns_sd::Receiver<ServiceEvent>) {
    // mDNS removals identify a service by its full instance name, not by our id,
    // so we keep a local fullname -> id map to resolve them.
    let mut fullname_to_id: HashMap<String, String> = HashMap::new();

    for event in browse.iter() {
        match event {
            ServiceEvent::ServiceResolved(info) => {
                let Some(device) = device_from_info(&info) else {
                    continue;
                };
                // Never list ourselves.
                if device.id == state.inner.our_id {
                    continue;
                }
                fullname_to_id.insert(info.get_fullname().to_string(), device.id.clone());
                state
                    .inner
                    .peers
                    .lock()
                    .unwrap()
                    .insert(device.id.clone(), device);
                emit_devices(&app, &state);
            }
            ServiceEvent::ServiceRemoved(_ty, fullname) => {
                if let Some(id) = fullname_to_id.remove(&fullname) {
                    state.inner.peers.lock().unwrap().remove(&id);
                    emit_devices(&app, &state);
                }
            }
            _ => {}
        }
    }
}

/// Extract a `Device` from a resolved service, picking a dialable IPv4 address.
fn device_from_info(info: &ServiceInfo) -> Option<Device> {
    let id = info.get_property_val_str("id")?.to_string();
    // Fall back to the instance name if a peer somehow advertised no friendly name.
    let name = info
        .get_property_val_str("name")
        .map(|s| s.to_string())
        .unwrap_or_else(|| info.get_fullname().to_string());

    let addrs = info.get_addresses();
    let ip = addrs
        .iter()
        .find(|ip| ip.is_ipv4())
        .or_else(|| addrs.iter().next())?;

    Some(Device {
        id,
        name,
        addr: format!("{ip}:{}", info.get_port()),
    })
}

fn emit_devices(app: &AppHandle, state: &AppState) {
    let devices: Vec<Device> = state.inner.peers.lock().unwrap().values().cloned().collect();
    let _ = app.emit("devices-changed", devices);
}
