import React, { useState } from 'react';
import { Network, Database, MessageSquare, Send, Users, Zap, Server, Shield, Clock, BarChart3 } from 'lucide-react';

const TelegramBotArchitecture = () => {
  const [activeComponent, setActiveComponent] = useState(null);

  const components = {
    telegram: {
      title: "Telegram Bot API",
      description: "Official Telegram Bot API for sending/receiving messages",
      details: [
        "Webhook or Long Polling for receiving updates",
        "sendMessage API for individual messages",
        "Rate limits: 30 msgs/sec, 20 msgs/min per chat",
        "Handles incoming messages, commands, callbacks"
      ]
    },
    queue: {
      title: "Message Queue",
      description: "Manages bulk message distribution",
      details: [
        "Redis Queue or RabbitMQ for job management",
        "Priority queuing for urgent messages",
        "Retry logic for failed sends",
        "Rate limiting enforcement"
      ]
    },
    database: {
      title: "Database Layer",
      description: "Stores users, messages, and conversation state",
      details: [
        "PostgreSQL/MongoDB for user data",
        "Message templates and history",
        "Conversation context and state",
        "Analytics and delivery tracking"
      ]
    },
    worker: {
      title: "Worker Processes",
      description: "Handles message sending in background",
      details: [
        "Multiple workers for parallel processing",
        "Respects Telegram rate limits",
        "Tracks delivery status",
        "Error handling and logging"
      ]
    },
    reply: {
      title: "Reply Handler",
      description: "Processes incoming messages and generates responses",
      details: [
        "Intent recognition and routing",
        "AI/Rule-based response generation",
        "Context management per user",
        "Command processing (/start, /help)"
      ]
    },
    api: {
      title: "REST API Server",
      description: "Interface for admin operations",
      details: [
        "Create/schedule bulk campaigns",
        "User management endpoints",
        "Analytics and reporting",
        "Template management"
      ]
    },
    cache: {
      title: "Cache Layer",
      description: "Redis for fast data access",
      details: [
        "User session data",
        "Conversation state",
        "Rate limiting counters",
        "Frequently accessed templates"
      ]
    },
    scheduler: {
      title: "Task Scheduler",
      description: "Manages scheduled messages",
      details: [
        "Cron jobs for scheduled campaigns",
        "Time-zone aware delivery",
        "Recurring message patterns",
        "Cleanup and maintenance tasks"
      ]
    }
  };

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8 overflow-auto">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-2 text-center">
          Telegram Bulk Messaging Bot Architecture
        </h1>
        <p className="text-slate-400 text-center mb-8">Click any component for details</p>

        {/* Architecture Diagram */}
        <div className="relative bg-slate-800/50 rounded-2xl p-8 backdrop-blur border border-slate-700">
          
          {/* Top Layer - External Interface */}
          <div className="flex justify-center mb-12">
            <div 
              className="bg-blue-600 hover:bg-blue-500 transition-all cursor-pointer p-6 rounded-xl shadow-lg transform hover:scale-105"
              onClick={() => setActiveComponent('telegram')}
            >
              <MessageSquare className="w-8 h-8 text-white mx-auto mb-2" />
              <div className="text-white font-semibold">Telegram Bot API</div>
              <div className="text-blue-200 text-sm">Webhook/Polling</div>
            </div>
          </div>

          {/* Arrow Down */}
          <div className="flex justify-center mb-8">
            <div className="w-1 h-12 bg-slate-600"></div>
          </div>

          {/* Middle Layer - Core Processing */}
          <div className="grid grid-cols-3 gap-6 mb-12">
            <div 
              className="bg-purple-600 hover:bg-purple-500 transition-all cursor-pointer p-6 rounded-xl shadow-lg transform hover:scale-105"
              onClick={() => setActiveComponent('reply')}
            >
              <Zap className="w-8 h-8 text-white mx-auto mb-2" />
              <div className="text-white font-semibold text-center">Reply Handler</div>
              <div className="text-purple-200 text-sm text-center">Process Incoming</div>
            </div>

            <div 
              className="bg-green-600 hover:bg-green-500 transition-all cursor-pointer p-6 rounded-xl shadow-lg transform hover:scale-105"
              onClick={() => setActiveComponent('api')}
            >
              <Server className="w-8 h-8 text-white mx-auto mb-2" />
              <div className="text-white font-semibold text-center">REST API</div>
              <div className="text-green-200 text-sm text-center">Admin Interface</div>
            </div>

            <div 
              className="bg-orange-600 hover:bg-orange-500 transition-all cursor-pointer p-6 rounded-xl shadow-lg transform hover:scale-105"
              onClick={() => setActiveComponent('scheduler')}
            >
              <Clock className="w-8 h-8 text-white mx-auto mb-2" />
              <div className="text-white font-semibold text-center">Scheduler</div>
              <div className="text-orange-200 text-sm text-center">Campaigns</div>
            </div>
          </div>

          {/* Arrow Down */}
          <div className="flex justify-center mb-8">
            <div className="w-1 h-12 bg-slate-600"></div>
          </div>

          {/* Queue Layer */}
          <div className="flex justify-center mb-12">
            <div 
              className="bg-yellow-600 hover:bg-yellow-500 transition-all cursor-pointer p-6 rounded-xl shadow-lg transform hover:scale-105"
              onClick={() => setActiveComponent('queue')}
            >
              <Send className="w-8 h-8 text-white mx-auto mb-2" />
              <div className="text-white font-semibold">Message Queue</div>
              <div className="text-yellow-200 text-sm">Redis/RabbitMQ</div>
            </div>
          </div>

          {/* Arrow Down */}
          <div className="flex justify-center mb-8">
            <div className="w-1 h-12 bg-slate-600"></div>
          </div>

          {/* Bottom Layer - Data & Workers */}
          <div className="grid grid-cols-3 gap-6">
            <div 
              className="bg-red-600 hover:bg-red-500 transition-all cursor-pointer p-6 rounded-xl shadow-lg transform hover:scale-105"
              onClick={() => setActiveComponent('worker')}
            >
              <Users className="w-8 h-8 text-white mx-auto mb-2" />
              <div className="text-white font-semibold text-center">Worker Pool</div>
              <div className="text-red-200 text-sm text-center">Send Messages</div>
            </div>

            <div 
              className="bg-indigo-600 hover:bg-indigo-500 transition-all cursor-pointer p-6 rounded-xl shadow-lg transform hover:scale-105"
              onClick={() => setActiveComponent('database')}
            >
              <Database className="w-8 h-8 text-white mx-auto mb-2" />
              <div className="text-white font-semibold text-center">Database</div>
              <div className="text-indigo-200 text-sm text-center">PostgreSQL/Mongo</div>
            </div>

            <div 
              className="bg-cyan-600 hover:bg-cyan-500 transition-all cursor-pointer p-6 rounded-xl shadow-lg transform hover:scale-105"
              onClick={() => setActiveComponent('cache')}
            >
              <Zap className="w-8 h-8 text-white mx-auto mb-2" />
              <div className="text-white font-semibold text-center">Cache Layer</div>
              <div className="text-cyan-200 text-sm text-center">Redis</div>
            </div>
          </div>
        </div>

        {/* Component Details */}
        {activeComponent && (
          <div className="mt-8 bg-slate-800 rounded-xl p-6 border border-slate-700 animate-fadeIn">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">
                  {components[activeComponent].title}
                </h3>
                <p className="text-slate-400">{components[activeComponent].description}</p>
              </div>
              <button 
                onClick={() => setActiveComponent(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <ul className="space-y-2">
              {components[activeComponent].details.map((detail, idx) => (
                <li key={idx} className="flex items-start text-slate-300">
                  <span className="text-blue-400 mr-2">•</span>
                  {detail}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Key Features */}
        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center">
              <Send className="w-6 h-6 mr-2 text-blue-400" />
              Bulk Messaging Flow
            </h3>
            <ol className="space-y-2 text-slate-300 text-sm">
              <li>1. Admin creates campaign via REST API</li>
              <li>2. Campaign stored in database</li>
              <li>3. Scheduler triggers at specified time</li>
              <li>4. Messages queued with recipient list</li>
              <li>5. Workers process queue respecting rate limits</li>
              <li>6. Delivery status tracked in database</li>
            </ol>
          </div>

          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center">
              <MessageSquare className="w-6 h-6 mr-2 text-purple-400" />
              Reply Handling Flow
            </h3>
            <ol className="space-y-2 text-slate-300 text-sm">
              <li>1. User sends message to bot</li>
              <li>2. Webhook/Polling receives update</li>
              <li>3. Reply Handler processes intent</li>
              <li>4. Load user context from cache/DB</li>
              <li>5. Generate response (AI/Rules)</li>
              <li>6. Send reply via Telegram API</li>
            </ol>
          </div>
        </div>

        {/* Tech Stack Recommendations */}
        <div className="mt-8 bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-xl font-bold text-white mb-4">Recommended Tech Stack</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-blue-400 font-semibold mb-1">Backend</div>
              <div className="text-slate-300 text-sm">Node.js, Python, or Go</div>
            </div>
            <div className="text-center">
              <div className="text-green-400 font-semibold mb-1">Queue</div>
              <div className="text-slate-300 text-sm">Redis Queue or Bull</div>
            </div>
            <div className="text-center">
              <div className="text-purple-400 font-semibold mb-1">Database</div>
              <div className="text-slate-300 text-sm">PostgreSQL + Redis</div>
            </div>
            <div className="text-center">
              <div className="text-orange-400 font-semibold mb-1">Library</div>
              <div className="text-slate-300 text-sm">node-telegram-bot-api</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TelegramBotArchitecture;
