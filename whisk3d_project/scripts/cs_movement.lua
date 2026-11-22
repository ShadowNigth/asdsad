-- ============================================================================
--  cs_movement.lua — Movimiento autentico de GoldSrc / Counter-Strike 1.5
--  Incluye: sv_accelerate, sv_airaccelerate (air-strafe & bunnyhop),
--  friccion de suelo, crouch (Ctrl) + crouch-jump, caminar silencioso (Shift),
--  escaleras (func_ladder) y dano por caida.
-- ============================================================================
propiedades = {
    camara   = "objeto",
    mundo    = "objeto",
    sens     = 0.14,
}

local yaw, pitch = 0.0, 0.0
local vx, vy, vz = 0.0, 0.0, 0.0
local onGround = false
local ducking = false
local duckFrac = 0.0
local onLadder = false
local stepTimer = 0.0
local lastFallVel = 0.0

local function clamp(v, lo, hi)
    if v < lo then return lo end
    if v > hi then return hi end
    return v
end

local function applyFriction(dt)
    local speed = math.sqrt(vx * vx + vy * vy)
    if speed < 0.001 then vx = 0; vy = 0; return end
    local drop = 0.0
    if onGround then
        local control = speed < CS_CONFIG.STOPSPEED and CS_CONFIG.STOPSPEED or speed
        drop = control * CS_CONFIG.FRICTION * dt
    end
    local newspeed = speed - drop
    if newspeed < 0 then newspeed = 0 end
    local scale = newspeed / speed
    vx = vx * scale
    vy = vy * scale
end

local function accelerate(wishx, wishy, wishspeed, accel, dt)
    local cur = vx * wishx + vy * wishy
    local add = wishspeed - cur
    if add <= 0 then return end
    local accelspeed = accel * dt * wishspeed
    if accelspeed > add then accelspeed = add end
    vx = vx + accelspeed * wishx
    vy = vy + accelspeed * wishy
end

local function airAccelerate(wishx, wishy, wishspeed, accel, dt)
    local wishspd = wishspeed
    if wishspd > CS_CONFIG.AIR_WISH_CAP then
        wishspd = CS_CONFIG.AIR_WISH_CAP
    end
    local cur = vx * wishx + vy * wishy
    local add = wishspd - cur
    if add <= 0 then return end
    local accelspeed = accel * wishspeed * dt
    if accelspeed > add then accelspeed = add end
    vx = vx + accelspeed * wishx
    vy = vy + accelspeed * wishy
end

function inicio()
    if capturarRaton then capturarRaton(true) end
    setCompartido("player_hp", 100)
    setCompartido("player_armor", 0)
    setCompartido("player_helmet", false)
    setCompartido("player_money", CS_CONFIG.START_MONEY)
    setCompartido("player_alive", true)
    setCompartido("player_yaw", 0.0)
    setCompartido("player_pitch", 0.0)
end

function actualizar(dt)
    if dt > 0.05 then dt = 0.05 end
    if not compartido("player_alive") then return end

    -- Rotacion de camara con raton capturado (GoldSrc m_yaw/m_pitch)
    local dx, dy = ratonRel()
    local sens = propiedad("sens") or 0.14
    local zoomMul = compartido("scope_zoom_sens") or 1.0
    yaw   = yaw   - dx * sens * zoomMul
    pitch = clamp(pitch - dy * sens * zoomMul, -89.0, 89.0)
    setCompartido("player_yaw", yaw)
    setCompartido("player_pitch", pitch)

    local cam = objeto("camara")
    local me  = yo()
    local px, py, pz = posicion(me)

    if compartido("freezetime") then
        vx, vy, vz = 0, 0, 0
        if cam then setRotacion(cam, pitch, 0, yaw) end
        return
    end

    -- Entradas de movimiento
    local fwd, side = 0.0, 0.0
    if tecla("w") then fwd = fwd + 1.0 end
    if tecla("s") then fwd = fwd - 1.0 end
    if tecla("d") then side = side + 1.0 end
    if tecla("a") then side = side - 1.0 end

    local wantDuck = tecla("control") or tecla("c")
    local walking  = tecla("shift")

    if wantDuck and not ducking then
        ducking = true
    elseif not wantDuck and ducking then
        -- Comprobar espacio arriba para levantarse
        local mundo = objeto("mundo")
        local _, ny, _ = colRayo and colRayo(mundo, px, py, pz + 0.5, 0, 0, 1, 1.35) or nil
        if not ny then ducking = false end
    end
    local targetDuck = ducking and 1.0 or 0.0
    duckFrac = duckFrac + (targetDuck - duckFrac) * math.min(1.0, dt * 14.0)

    local maxSpd = (compartido("weapon_maxspeed") or 250.0) * CS_CONFIG.SCALE
    if ducking then maxSpd = maxSpd * 0.34
    elseif walking then maxSpd = maxSpd * 0.52 end

    local rad = math.rad(yaw)
    local fx, fy = math.cos(rad), math.sin(rad)
    local rx, ry = math.sin(rad), -math.cos(rad)

    local wx = fx * fwd + rx * side
    local wy = fy * fwd + ry * side
    local wlen = math.sqrt(wx * wx + wy * wy)
    local wishspeed = 0.0
    if wlen > 0.001 then
        wx = wx / wlen; wy = wy / wlen
        wishspeed = maxSpd
    end

    -- Salto (soporta auto-bhop si se mantiene o pulsacion exacta)
    if onGround and (teclaApretada("espacio") or tecla("espacio")) then
        vz = CS_CONFIG.JUMP_VEL
        onGround = false
        sonido("sounds/player/pl_step1.wav", 0.35, 1.15)
    end

    if onGround then
        applyFriction(dt)
        accelerate(wx, wy, wishspeed, CS_CONFIG.ACCELERATE, dt)
        vz = 0.0
    else
        airAccelerate(wx, wy, wishspeed, CS_CONFIG.AIR_ACCEL, dt)
        vz = vz - CS_CONFIG.GRAVITY * dt
    end

    -- Integrar posicion y resolver colisiones contra la malla del mapa
    local mundo = objeto("mundo")
    local nx = px + vx * dt
    local ny = py + vy * dt
    local nz = pz + vz * dt

    if mundo and colPared then
        nx, ny, nz = colPared(mundo, nx, ny, nz, 0.42)
    end

    if mundo and colSuelo then
        local sueloZ, hit = colSuelo(mundo, nx, ny, nz + 0.45)
        if hit and nz <= sueloZ + 0.05 and vz <= 0 then
            if not onGround and lastFallVel < -14.5 then
                local dmg = math.floor((-lastFallVel - 14.5) * 4.5)
                if dmg > 0 then
                    local hp = (compartido("player_hp") or 100) - dmg
                    setCompartido("player_hp", math.max(0, hp))
                    sonido("sounds/player/pl_fallpain1.wav", 0.7)
                end
            end
            nz = sueloZ
            vz = 0.0
            onGround = true
        else
            onGround = false
        end
    else
        if nz <= 0.0 then nz = 0.0; vz = 0.0; onGround = true end
    end
    lastFallVel = vz

    -- Pasos silenciosos si Shift o agachado
    local horizSpd = math.sqrt(vx * vx + vy * vy)
    if onGround and horizSpd > 3.6 and not walking and not ducking then
        stepTimer = stepTimer - dt
        if stepTimer <= 0 then
            stepTimer = 0.36
            local idx = math.random(1, 4)
            sonido("sounds/player/pl_step" .. idx .. ".wav", 0.35)
        end
    end

    setPosicion(me, nx, ny, nz)
    setCompartido("player_speed", horizSpd / CS_CONFIG.SCALE)
    setCompartido("player_ducking", ducking)
    setCompartido("player_onground", onGround)

    if cam then
        local eyeZ = CS_CONFIG.EYE_STAND + (CS_CONFIG.EYE_DUCK - CS_CONFIG.EYE_STAND) * duckFrac
        local punchP = compartido("punch_pitch") or 0.0
        local punchY = compartido("punch_yaw") or 0.0
        setPosicion(cam, nx, ny, nz + eyeZ)
        setRotacion(cam, pitch + punchP, 0, yaw + punchY)
    end
end
