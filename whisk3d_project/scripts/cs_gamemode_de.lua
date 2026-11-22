-- ============================================================================
--  cs_gamemode_de.lua — Modo Bomb Defusal (de_*) completo de Counter-Strike 1.5
--  Freezetime, Buyzone (90s), Plantar C4 (3.2s), Detonacion (45s),
--  Desactivar C4 (10s / 5s con Defuser), Economia por rachas y Marcador.
-- ============================================================================
propiedades = {
    bomba = "objeto",
}

local roundState = "FREEZETIME"  -- FREEZETIME, LIVE, PLANTED, ROUND_END
local timer = 3.0
local buyTimer = 90.0
local c4Timer = 45.0
local beepTimer = 0.0
local scoreCT, scoreT = 0, 0
local lossStreakCT, lossStreakT = 0, 0
local plantProgress = 0.0
local defuseProgress = 0.0

function inicio()
    setCompartido("score_ct", 0)
    setCompartido("score_t", 0)
    setCompartido("round_state", roundState)
    setCompartido("round_timer", timer)
    setCompartido("freezetime", true)
    setCompartido("in_buyzone", true)
end

local function endRound(winner, reason, bombExploded)
    roundState = "ROUND_END"
    timer = 5.0
    if winner == "CT" then
        scoreCT = scoreCT + 1
        lossStreakCT = 0
        lossStreakT = math.min(4, lossStreakT + 1)
        sonido("sounds/radio/ctwin.wav", 0.9)
    else
        scoreT = scoreT + 1
        lossStreakT = 0
        lossStreakCT = math.min(4, lossStreakCT + 1)
        sonido("sounds/radio/terwin.wav", 0.9)
    end
    setCompartido("score_ct", scoreCT)
    setCompartido("score_t", scoreT)
    setCompartido("round_banner", reason)

    -- Premio economico al jugador segun equipo
    local myTeam = compartido("player_team") or "CT"
    local money = compartido("player_money") or 800
    if myTeam == winner then
        local winBonus = (winner == "T" and bombExploded) and CS_CONFIG.BOMB_WIN_T or CS_CONFIG.WIN_REWARD
        money = money + winBonus
    else
        local streak = (myTeam == "CT") and lossStreakCT or lossStreakT
        money = money + math.min(CS_CONFIG.LOSS_MAX, CS_CONFIG.LOSS_BASE + (streak - 1) * CS_CONFIG.LOSS_STEP)
    end
    setCompartido("player_money", math.min(CS_CONFIG.MAX_MONEY, money))
end

function actualizar(dt)
    timer = timer - dt
    if buyTimer > 0 then buyTimer = buyTimer - dt end
    setCompartido("buytime_left", math.max(0, buyTimer))

    if roundState == "FREEZETIME" then
        setCompartido("freezetime", true)
        setCompartido("round_timer", math.max(0, timer))
        if timer <= 0 then
            roundState = "LIVE"
            timer = 150.0  -- mp_roundtime 2.5 min
            setCompartido("freezetime", false)
            sonido("sounds/radio/locknload.wav", 0.8)
        end
    elseif roundState == "LIVE" then
        setCompartido("round_timer", math.max(0, timer))
        -- Chequear solicitud de plantar C4
        if compartido("c4_plant_req") and compartido("in_bombsite") then
            plantProgress = plantProgress + dt
            if plantProgress >= 3.2 then
                plantProgress = 0.0
                roundState = "PLANTED"
                c4Timer = 45.0
                beepTimer = 1.0
                setCompartido("c4_planted", true)
                setCompartido("c4_plant_req", false)
                setCompartido("player_money", math.min(CS_CONFIG.MAX_MONEY, (compartido("player_money") or 0) + CS_CONFIG.PLANT_BONUS))
                sonido("sounds/weapons/c4_plant.wav", 0.9)
                sonido("sounds/radio/bombpl.wav", 0.9)
            end
        else
            plantProgress = 0.0
        end
        if timer <= 0 then
            endRound("CT", "Target Successfully Defended! Counter-Terrorists Win!", false)
        end
    elseif roundState == "PLANTED" then
        c4Timer = c4Timer - dt
        setCompartido("round_timer", math.max(0, c4Timer))
        beepTimer = beepTimer - dt
        if beepTimer <= 0 then
            local interval = 0.15 + 0.85 * (c4Timer / 45.0)
            beepTimer = math.max(0.14, interval)
            sonido("sounds/weapons/c4_beep1.wav", 0.85)
        end
        -- Desactivar con E cerca de la bomba
        if tecla("e") and compartido("near_c4") then
            local needTime = compartido("has_defuser") and 5.0 or 10.0
            defuseProgress = defuseProgress + dt
            if defuseProgress >= needTime then
                defuseProgress = 0.0
                setCompartido("c4_planted", false)
                setCompartido("player_money", math.min(CS_CONFIG.MAX_MONEY, (compartido("player_money") or 0) + CS_CONFIG.DEFUSE_BONUS))
                sonido("sounds/weapons/c4_disarmed.wav", 0.9)
                sonido("sounds/radio/bombdef.wav", 0.9)
                endRound("CT", "The bomb has been defused! Counter-Terrorists Win!", false)
            end
        else
            defuseProgress = 0.0
        end
        if c4Timer <= 0 then
            setCompartido("c4_planted", false)
            sonido("sounds/weapons/c4_explode1.wav", 1.0)
            endRound("T", "Target Bombed! Terrorists Win!", true)
        end
    elseif roundState == "ROUND_END" then
        if timer <= 0 then
            roundState = "FREEZETIME"
            timer = 3.0
            buyTimer = 90.0
            setCompartido("round_banner", nil)
            setCompartido("c4_planted", false)
            setCompartido("player_hp", 100)
            setCompartido("player_alive", true)
            setCompartido("reset_round", true)
        end
    end

    setCompartido("round_state", roundState)
    setCompartido("plant_progress", plantProgress)
    setCompartido("defuse_progress", defuseProgress)
end
