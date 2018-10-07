import {LoginHandler} from './LoginHandler';
import {LoginResponse} from './classes/LoginResponse';
import {LoginParameters} from './classes/LoginParameters';
import {Agent} from './classes/Agent';
import {PacketFlags} from './enums/PacketFlags';
import {UseCircuitCodeMessage} from './classes/messages/UseCircuitCode';
import {CompleteAgentMovementMessage} from './classes/messages/CompleteAgentMovement';
import {Message} from './enums/Message';
import {Packet} from './classes/Packet';
import {Region} from './classes/Region';
import {LogoutRequestMessage} from './classes/messages/LogoutRequest';
import {Utils} from './classes/Utils';
import {RegionHandshakeReplyMessage} from './classes/messages/RegionHandshakeReply';
import {RegionProtocolFlags} from './enums/RegionProtocolFlags';
import {AgentDataUpdateRequestMessage} from './classes/messages/AgentDataUpdateRequest';
import {TeleportProgressMessage} from './classes/messages/TeleportProgress';
import {TeleportStartMessage} from './classes/messages/TeleportStart';
import {TeleportEvent} from './events/TeleportEvent';
import {ClientEvents} from './classes/ClientEvents';
import {TeleportEventType} from './enums/TeleportEventType';
import {ClientCommands} from './classes/ClientCommands';
import {DisconnectEvent} from './events/DisconnectEvent';
import {KickUserMessage} from './classes/messages/KickUser';
import {StartPingCheckMessage} from './classes/messages/StartPingCheck';
import {CompletePingCheckMessage} from './classes/messages/CompletePingCheck';
import Timer = NodeJS.Timer;
import {Subscription} from 'rxjs/Subscription';
import {BotOptionFlags} from './enums/BotOptionFlags';
import {FilterResponse} from './enums/FilterResponse';
import {LogoutReplyMessage} from './classes/messages/LogoutReply';

export class Bot
{
    private loginParams: LoginParameters;
    private currentRegion: Region;
    private agent: Agent;
    private ping: Timer | null = null;
    private pingNumber = 0;
    private lastSuccessfulPing = 0;
    private circuitSubscription: Subscription | null = null;
    private options: BotOptionFlags;
    public clientEvents: ClientEvents;
    public clientCommands: ClientCommands;


    constructor(login: LoginParameters, options: BotOptionFlags)
    {
        this.clientEvents = new ClientEvents();
        this.loginParams = login;
        this.options = options;
    }

    async login()
    {
        const loginHandler = new LoginHandler(this.clientEvents, this.options);
        const response: LoginResponse = await loginHandler.Login(this.loginParams);
        this.currentRegion = response.region;
        this.agent = response.agent;
        this.clientCommands = new ClientCommands(response.region, response.agent, this);
        return response;
    }

    async changeRegion(region: Region)
    {
        this.currentRegion = region;
        this.clientCommands = new ClientCommands(this.currentRegion, this.agent, this);
        if (this.ping !== null)
        {
            clearInterval(this.ping);
            this.ping = null;
        }

        await this.connectToSim();
    }

    private closeCircuit()
    {
        this.agent.shutdown();
        this.currentRegion.shutdown();
        if (this.circuitSubscription !== null)
        {
            this.circuitSubscription.unsubscribe();
            this.circuitSubscription = null;
        }
        delete this.currentRegion;
        delete this.agent;
        delete this.clientCommands;
        if (this.ping !== null)
        {
            clearInterval(this.ping);
            this.ping = null;
        }

    }

    private kicked(message: string)
    {
        this.closeCircuit();
        this.disconnected(false, message);
    }

    private disconnected(requested: boolean, message: string)
    {
        const disconnectEvent = new DisconnectEvent();
        disconnectEvent.requested = requested;
        disconnectEvent.message = message;
        if (this.clientEvents)
        {
            this.clientEvents.onDisconnected.next(disconnectEvent);
        }
    }

    async close()
    {
        const circuit = this.currentRegion.circuit;
        const msg: LogoutRequestMessage = new LogoutRequestMessage();
        msg.AgentData = {
            AgentID: this.agent.agentID,
            SessionID: circuit.sessionID
        };
        circuit.sendMessage(msg, PacketFlags.Reliable);
        await circuit.waitForMessage<LogoutReplyMessage>(Message.LogoutReply, 5000);

        this.closeCircuit();
        this.disconnected(true, 'Logout completed');
    }

    async connectToSim()
    {
        const circuit = this.currentRegion.circuit;
        circuit.init();
        const msg: UseCircuitCodeMessage = new UseCircuitCodeMessage();
        msg.CircuitCode = {
            SessionID: circuit.sessionID,
            ID: this.agent.agentID,
            Code: circuit.circuitCode
        };

        await circuit.waitForAck(circuit.sendMessage(msg, PacketFlags.Reliable), 1000);


        const agentMovement: CompleteAgentMovementMessage = new CompleteAgentMovementMessage();
        agentMovement.AgentData = {
            AgentID: this.agent.agentID,
            SessionID: circuit.sessionID,
            CircuitCode: circuit.circuitCode
        };
        circuit.sendMessage(agentMovement, PacketFlags.Reliable);

        await circuit.waitForMessage(Message.RegionHandshake, 10000);

        const handshakeReply: RegionHandshakeReplyMessage = new RegionHandshakeReplyMessage();
        handshakeReply.AgentData = {
            AgentID: this.agent.agentID,
            SessionID: circuit.sessionID
        };
        handshakeReply.RegionInfo = {
            Flags: RegionProtocolFlags.SelfAppearanceSupport | RegionProtocolFlags.AgentAppearanceService
        };
        await circuit.waitForAck(circuit.sendMessage(handshakeReply, PacketFlags.Reliable), 10000);

        if (this.clientCommands !== null)
        {
            this.clientCommands.network.setBandwidth(1536000);
        }

        const agentRequest = new AgentDataUpdateRequestMessage();
        agentRequest.AgentData = {
            AgentID: this.agent.agentID,
            SessionID: circuit.sessionID
        };
        circuit.sendMessage(agentRequest, PacketFlags.Reliable);
        this.agent.setInitialAppearance();
        this.agent.circuitActive();

        this.lastSuccessfulPing = new Date().getTime();

        this.ping = setInterval(async () =>
        {
            this.pingNumber++;
            if (this.pingNumber > 255)
            {
                this.pingNumber = 0;
            }
            const ping = new StartPingCheckMessage();
            ping.PingID = {
                PingID: this.pingNumber,
                OldestUnacked: this.currentRegion.circuit.getOldestUnacked()
            };
            circuit.sendMessage(ping, PacketFlags.Reliable);

            circuit.waitForMessage<CompletePingCheckMessage>(Message.CompletePingCheck, 10000, ((pingData: {
                pingID: number,
                timeSent: number
            }, cpc: CompletePingCheckMessage): FilterResponse =>
            {
                if (cpc.PingID.PingID === pingData.pingID)
                {
                    this.lastSuccessfulPing = new Date().getTime();
                    const pingTime = this.lastSuccessfulPing - pingData.timeSent;
                    if (this.clientEvents !== null)
                    {
                        this.clientEvents.onCircuitLatency.next(pingTime);
                    }
                    return FilterResponse.Finish;
                }
                return FilterResponse.NoMatch;
            }).bind(this, {
                pingID: this.pingNumber,
                timeSent: new Date().getTime()
            }));


            if ((new Date().getTime() - this.lastSuccessfulPing) > 60000)
            {
                // We're dead, jim
                this.kicked('Circuit Timeout');
            }

        }, 5000);

        this.circuitSubscription = circuit.subscribeToMessages(
            [
                Message.TeleportFailed,
                Message.TeleportFinish,
                Message.TeleportLocal,
                Message.TeleportStart,
                Message.TeleportProgress,
                Message.TeleportCancel,
                Message.KickUser
            ], (packet: Packet) =>
            {
                switch (packet.message.id)
                {
                    case Message.TeleportLocal:
                    {
                        const tpEvent = new TeleportEvent();
                        tpEvent.message = '';
                        tpEvent.eventType = TeleportEventType.TeleportCompleted;
                        tpEvent.simIP = 'local';
                        tpEvent.simPort = 0;
                        tpEvent.seedCapability = '';

                        if (this.clientEvents === null)
                        {
                            this.kicked('ClientEvents is null');
                        }

                        this.clientEvents.onTeleportEvent.next(tpEvent);
                        break;
                    }
                    case Message.TeleportStart:
                    {
                        const teleportStart = packet.message as TeleportStartMessage;

                        const tpEvent = new TeleportEvent();
                        tpEvent.message = '';
                        tpEvent.eventType = TeleportEventType.TeleportStarted;
                        tpEvent.simIP = '';
                        tpEvent.simPort = 0;
                        tpEvent.seedCapability = '';

                        if (this.clientEvents === null)
                        {
                            this.kicked('ClientEvents is null');
                        }

                        this.clientEvents.onTeleportEvent.next(tpEvent);
                        break;
                    }
                    case Message.TeleportProgress:
                    {
                        const teleportProgress = packet.message as TeleportProgressMessage;
                        const message = Utils.BufferToStringSimple(teleportProgress.Info.Message);

                        const tpEvent = new TeleportEvent();
                        tpEvent.message = message;
                        tpEvent.eventType = TeleportEventType.TeleportProgress;
                        tpEvent.simIP = '';
                        tpEvent.simPort = 0;
                        tpEvent.seedCapability = '';

                        if (this.clientEvents === null)
                        {
                            this.kicked('ClientEvents is null');
                        }

                        this.clientEvents.onTeleportEvent.next(tpEvent);
                        break;
                    }
                    case Message.KickUser:
                    {
                        const kickUser = packet.message as KickUserMessage;
                        this.kicked(Utils.BufferToStringSimple(kickUser.UserInfo.Reason));

                        break;
                    }
                }
            });
    }
}
