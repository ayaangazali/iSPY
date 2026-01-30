"use client"

import { Bell, Search, User, Settings, LogOut } from "lucide-react"
import { signOutAction } from "@/app/actions"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Link from "next/link"
import { useRouter } from "next/navigation"

export function DashboardHeader() {
  const router = useRouter()
  return (
    <header className="h-16 border-b border-white/5 bg-[#111] flex items-center justify-between px-6">
      {/* Search Bar */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray" />
          <Input
            type="text"
            placeholder="Search..."
            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-gray/50 focus:border-mint focus:ring-0"
          />
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="relative p-2 rounded-lg hover:bg-white/5 transition-colors">
              <Bell className="w-5 h-5 text-gray" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-coral rounded-full" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72 bg-[#111] border-white/10">
            <DropdownMenuLabel className="text-white">Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/10" />
            <div className="max-h-64 overflow-y-auto">
              <DropdownMenuItem className="flex-col items-start p-3 hover:bg-white/5 cursor-pointer">
                <div className="flex items-center gap-2 mb-1 w-full">
                  <div className="w-2 h-2 bg-coral rounded-full" />
                  <span className="text-sm font-medium text-white">Security Alert</span>
                  <span className="text-xs text-gray ml-auto">2m ago</span>
                </div>
                <p className="text-xs text-gray">
                  Suspicious activity in Zone A
                </p>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex-col items-start p-3 hover:bg-white/5 cursor-pointer">
                <div className="flex items-center gap-2 mb-1 w-full">
                  <div className="w-2 h-2 bg-mint rounded-full" />
                  <span className="text-sm font-medium text-white">System Update</span>
                  <span className="text-xs text-gray ml-auto">1h ago</span>
                </div>
                <p className="text-xs text-gray">
                  All systems operational
                </p>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Settings */}
        <button className="p-2 rounded-lg hover:bg-white/5 transition-colors">
          <Settings className="w-5 h-5 text-gray" />
        </button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-2 w-9 h-9 bg-mint rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 text-gray-dark" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-[#111] border-white/10">
            <DropdownMenuLabel className="text-white">Account</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem 
              className="text-gray hover:text-white hover:bg-white/5 cursor-pointer"
              onClick={() => router.push('/account-settings')}
            >
              <User className="w-4 h-4 mr-2" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem 
              className="text-gray hover:text-white hover:bg-white/5 cursor-pointer"
              onClick={() => router.push('/settings')}
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem asChild>
              <form action={signOutAction} method="post">
                <button type="submit" className="w-full text-left text-coral hover:bg-coral/10 cursor-pointer flex items-center gap-2 px-2 py-1.5 rounded">
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
