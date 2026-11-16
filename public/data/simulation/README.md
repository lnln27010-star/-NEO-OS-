# 仿真测试数据

`thermal-electrical-timeseries.json` 是用于界面联调的可复现测试夹具，不是南京真实站点遥测。

- schema: `dt-sim-0.2`
- time step: 5 minutes
- electrical fields: OpenDSS/pandapower-compatible active/reactive power, voltage, current, power factor, frequency and branch load
- thermal fields: OpenFOAM/Modelica-compatible inlet/peak temperature, flow, pressure and cooling capacity
- scenarios: baseline, RPP branch fault, CDU flow reduction and UPS capacity fault
- provenance: `synthetic-calibration`, generated at `2026-09-29T08:00:00+08:00`

Production deployment must replace this fixture with solver output or signed telemetry and preserve model version, timestamp and source metadata.
